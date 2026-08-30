#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <windows.h>

#define MAX_PROMPT_CHARS 1024
#define MAX_HELPER_INPUT_BYTES 20480
#define MAX_CREDENTIAL_BYTES 8192
#define SESSION_REF_LENGTH 43
#define TIMEOUT_MS 5000
#define REQUEST_BYTES 49
#define BOUND_REQUEST_BYTES 2364
#define BOUND_PROTOCOL_BYTES 8
#define BOUND_HOST_BYTES 255
#define BOUND_PATH_BYTES 2048
#define RESPONSE_HEADER_BYTES 8
#define PROTOCOL_VERSION 1
#define BOUND_REQUEST_VERSION 2
#define KIND_USERNAME 1
#define KIND_PASSWORD 2

typedef struct credential_target {
    char protocol[BOUND_PROTOCOL_BYTES + 1];
    char host[BOUND_HOST_BYTES + 1];
    char path[BOUND_PATH_BYTES + 1];
} credential_target;

static int is_session_ref(const char *value) {
    size_t index;
    if (strlen(value) != SESSION_REF_LENGTH) {
        return 0;
    }
    for (index = 0; index < SESSION_REF_LENGTH; index++) {
        const char character = value[index];
        if (!((character >= 'A' && character <= 'Z') ||
              (character >= 'a' && character <= 'z') ||
              (character >= '0' && character <= '9') || character == '_' ||
              character == '-')) {
            return 0;
        }
    }
    return 1;
}

static int read_environment(const wchar_t *name, char *output, DWORD capacity) {
    wchar_t wide_value[64];
    DWORD length = GetEnvironmentVariableW(name, wide_value, 64);
    int converted;
    if (length == 0 || length >= 64) {
        return 0;
    }
    converted = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide_value,
                                    (int)length, output, (int)capacity - 1,
                                    NULL, NULL);
    if (converted <= 0 || converted >= (int)capacity) {
        return 0;
    }
    output[converted] = '\0';
    return 1;
}

static int parse_port(const char *value, unsigned short *port) {
    char *end = NULL;
    unsigned long parsed;
    size_t index;
    if (value[0] == '\0') {
        return 0;
    }
    for (index = 0; value[index] != '\0'; index++) {
        if (value[index] < '0' || value[index] > '9') {
            return 0;
        }
    }
    parsed = strtoul(value, &end, 10);
    if (*end != '\0' || parsed == 0 || parsed > 65535) {
        return 0;
    }
    *port = (unsigned short)parsed;
    return 1;
}

static int prompt_is_username(const wchar_t *prompt) {
    static const wchar_t needle[] = L"username";
    size_t prompt_length = wcslen(prompt);
    size_t index;
    size_t offset;
    for (index = 0; index + 8 <= prompt_length; index++) {
        for (offset = 0; offset < 8; offset++) {
            wchar_t character = prompt[index + offset];
            if (character >= L'A' && character <= L'Z') {
                character = (wchar_t)(character + (L'a' - L'A'));
            }
            if (character != needle[offset]) {
                break;
            }
        }
        if (offset == 8) {
            return 1;
        }
    }
    return 0;
}

static int send_all(SOCKET socket_handle, const unsigned char *data, int length) {
    int sent = 0;
    while (sent < length) {
        int result =
            send(socket_handle, (const char *)data + sent, length - sent, 0);
        if (result == SOCKET_ERROR || result == 0) {
            return 0;
        }
        sent += result;
    }
    return 1;
}

static int receive_exact(SOCKET socket_handle, unsigned char *data, int length) {
    int received = 0;
    while (received < length) {
        int result = recv(socket_handle, (char *)data + received,
                          length - received, 0);
        if (result == SOCKET_ERROR || result == 0) {
            return 0;
        }
        received += result;
    }
    return 1;
}

static int valid_credential(const unsigned char *value, int length) {
    int index;
    if (length <= 0 || length > MAX_CREDENTIAL_BYTES ||
        MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, (const char *)value,
                            length, NULL, 0) <= 0) {
        return 0;
    }
    for (index = 0; index < length; index++) {
        if (value[index] <= 31 || value[index] == 127) {
            return 0;
        }
    }
    return 1;
}

static int exchange_credential(unsigned short port,
                               const unsigned char *request,
                               int request_length,
                               unsigned char *credential,
                               int *credential_length) {
    WSADATA winsock_data;
    SOCKET socket_handle = INVALID_SOCKET;
    struct sockaddr_in address;
    DWORD timeout = TIMEOUT_MS;
    unsigned char response_header[RESPONSE_HEADER_BYTES];
    int response_length;
    int result = 0;
    if (WSAStartup(MAKEWORD(2, 2), &winsock_data) != 0) {
        return 0;
    }
    socket_handle = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_handle == INVALID_SOCKET) {
        goto cleanup;
    }
    if (setsockopt(socket_handle, SOL_SOCKET, SO_RCVTIMEO,
                   (const char *)&timeout, (int)sizeof(timeout)) ==
            SOCKET_ERROR ||
        setsockopt(socket_handle, SOL_SOCKET, SO_SNDTIMEO,
                   (const char *)&timeout, (int)sizeof(timeout)) ==
            SOCKET_ERROR) {
        goto cleanup;
    }
    ZeroMemory(&address, sizeof(address));
    address.sin_family = AF_INET;
    address.sin_port = htons(port);
    if (InetPtonA(AF_INET, "127.0.0.1", &address.sin_addr) != 1 ||
        connect(socket_handle, (struct sockaddr *)&address,
                (int)sizeof(address)) == SOCKET_ERROR) {
        goto cleanup;
    }
    if (!send_all(socket_handle, request, request_length) ||
        !receive_exact(socket_handle, response_header, RESPONSE_HEADER_BYTES) ||
        memcmp(response_header, "GLAP", 4) != 0 ||
        response_header[4] != PROTOCOL_VERSION || response_header[5] != 0) {
        goto cleanup;
    }
    response_length = ((int)response_header[6] << 8) | response_header[7];
    if (response_length <= 0 || response_length > MAX_CREDENTIAL_BYTES ||
        !receive_exact(socket_handle, credential, response_length) ||
        !valid_credential(credential, response_length)) {
        goto cleanup;
    }
    *credential_length = response_length;
    result = 1;

cleanup:
    SecureZeroMemory(response_header, sizeof(response_header));
    if (socket_handle != INVALID_SOCKET) {
        closesocket(socket_handle);
    }
    WSACleanup();
    return result;
}

static int request_credential(unsigned short port, const char *session_ref,
                              unsigned char kind, unsigned char *credential,
                              int *credential_length) {
    unsigned char request[REQUEST_BYTES];
    int result;
    memcpy(request, "GLAP", 4);
    request[4] = PROTOCOL_VERSION;
    request[5] = kind;
    memcpy(request + 6, session_ref, SESSION_REF_LENGTH);
    result = exchange_credential(port, request, REQUEST_BYTES, credential,
                                 credential_length);
    SecureZeroMemory(request, sizeof(request));
    return result;
}

static int request_bound_credential(unsigned short port,
                                    const char *session_ref,
                                    unsigned char kind,
                                    const credential_target *target,
                                    unsigned char *credential,
                                    int *credential_length) {
    unsigned char request[BOUND_REQUEST_BYTES];
    size_t protocol_length = strlen(target->protocol);
    size_t host_length = strlen(target->host);
    size_t path_length = strlen(target->path);
    int result;
    ZeroMemory(request, sizeof(request));
    memcpy(request, "GLAP", 4);
    request[4] = BOUND_REQUEST_VERSION;
    request[5] = kind;
    memcpy(request + 6, session_ref, SESSION_REF_LENGTH);
    request[49] = (unsigned char)protocol_length;
    memcpy(request + 50, target->protocol, protocol_length);
    request[58] = (unsigned char)host_length;
    memcpy(request + 59, target->host, host_length);
    request[314] = (unsigned char)((path_length >> 8) & 0xff);
    request[315] = (unsigned char)(path_length & 0xff);
    memcpy(request + 316, target->path, path_length);
    result = exchange_credential(port, request, BOUND_REQUEST_BYTES, credential,
                                 credential_length);
    SecureZeroMemory(request, sizeof(request));
    return result;
}

static int valid_target_value(const char *value, size_t length,
                              size_t maximum_length) {
    size_t index;
    if (length == 0 || length > maximum_length ||
        MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value, (int)length,
                            NULL, 0) <= 0) {
        return 0;
    }
    for (index = 0; index < length; index++) {
        unsigned char character = (unsigned char)value[index];
        if (character <= 31 || character == 127) {
            return 0;
        }
    }
    return 1;
}

static int set_target_value(char *destination, size_t capacity,
                            const char *value, size_t length) {
    if (destination[0] != '\0' ||
        !valid_target_value(value, length, capacity - 1)) {
        return 0;
    }
    memcpy(destination, value, length);
    destination[length] = '\0';
    return 1;
}

static int read_helper_input(unsigned char *input, size_t capacity,
                             size_t *input_length) {
    size_t length;
    if (_setmode(_fileno(stdin), _O_BINARY) == -1) {
        return 0;
    }
    length = fread(input, 1, capacity, stdin);
    if (ferror(stdin) || length > MAX_HELPER_INPUT_BYTES) {
        return 0;
    }
    *input_length = length;
    return 1;
}

static int parse_credential_target(unsigned char *input, size_t input_length,
                                   credential_target *target) {
    char *cursor = (char *)input;
    char *end = cursor + input_length;
    if (input_length == 0 || memchr(input, '\0', input_length) != NULL) {
        return 0;
    }
    input[input_length] = '\0';
    while (cursor < end) {
        char *line_end = memchr(cursor, '\n', (size_t)(end - cursor));
        char *separator;
        size_t key_length;
        size_t value_length;
        if (line_end == NULL) {
            line_end = end;
        }
        *line_end = '\0';
        if (*cursor != '\0') {
            separator = strchr(cursor, '=');
            if (separator == NULL || separator == cursor) {
                return 0;
            }
            key_length = (size_t)(separator - cursor);
            value_length = (size_t)(line_end - separator - 1);
            if (key_length == 8 && memcmp(cursor, "protocol", 8) == 0) {
                if (!set_target_value(target->protocol,
                                      sizeof(target->protocol), separator + 1,
                                      value_length)) {
                    return 0;
                }
            } else if (key_length == 4 && memcmp(cursor, "host", 4) == 0) {
                if (!set_target_value(target->host, sizeof(target->host),
                                      separator + 1, value_length)) {
                    return 0;
                }
            } else if (key_length == 4 && memcmp(cursor, "path", 4) == 0) {
                if (!set_target_value(target->path, sizeof(target->path),
                                      separator + 1, value_length)) {
                    return 0;
                }
            }
        }
        cursor = line_end + 1;
    }
    return target->protocol[0] != '\0' && target->host[0] != '\0' &&
           target->path[0] != '\0';
}

static int run_credential_helper(unsigned short port, const char *session_ref) {
    unsigned char input[MAX_HELPER_INPUT_BYTES + 1];
    unsigned char username[MAX_CREDENTIAL_BYTES];
    unsigned char password[MAX_CREDENTIAL_BYTES];
    credential_target target;
    size_t input_length = 0;
    int username_length = 0;
    int password_length = 0;
    int success = 0;
    ZeroMemory(&target, sizeof(target));
    if (!read_helper_input(input, sizeof(input), &input_length) ||
        !parse_credential_target(input, input_length, &target) ||
        !request_bound_credential(port, session_ref, KIND_USERNAME, &target,
                                  username, &username_length) ||
        !request_bound_credential(port, session_ref, KIND_PASSWORD, &target,
                                  password, &password_length) ||
        _setmode(_fileno(stdout), _O_BINARY) == -1 ||
        fwrite("username=", 1, 9, stdout) != 9 ||
        fwrite(username, 1, (size_t)username_length, stdout) !=
            (size_t)username_length ||
        fwrite("\npassword=", 1, 10, stdout) != 10 ||
        fwrite(password, 1, (size_t)password_length, stdout) !=
            (size_t)password_length ||
        fwrite("\n\n", 1, 2, stdout) != 2 || fflush(stdout) != 0) {
        goto cleanup;
    }
    success = 1;

cleanup:
    SecureZeroMemory(input, sizeof(input));
    SecureZeroMemory(username, sizeof(username));
    SecureZeroMemory(password, sizeof(password));
    SecureZeroMemory(&target, sizeof(target));
    return success;
}

static int ignore_credential_helper_input(void) {
    unsigned char input[MAX_HELPER_INPUT_BYTES + 1];
    size_t input_length = 0;
    int success = read_helper_input(input, sizeof(input), &input_length);
    SecureZeroMemory(input, sizeof(input));
    return success;
}

int wmain(int argc, wchar_t **argv) {
    char port_text[16];
    char session_ref[64];
    unsigned short port;
    unsigned char credential[MAX_CREDENTIAL_BYTES];
    int credential_length = 0;
    int success = 0;
    if (argc != 2 || argv[1][0] == L'\0' ||
        !read_environment(L"GODOT_LAUNCHER_GIT_CREDENTIAL_PORT", port_text,
                          sizeof(port_text)) ||
        !read_environment(L"GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION", session_ref,
                          sizeof(session_ref)) ||
        !parse_port(port_text, &port) || !is_session_ref(session_ref)) {
        goto cleanup;
    }
    if (wcscmp(argv[1], L"get") == 0) {
        success = run_credential_helper(port, session_ref);
        goto cleanup;
    }
    if (wcscmp(argv[1], L"store") == 0 || wcscmp(argv[1], L"erase") == 0) {
        success = ignore_credential_helper_input();
        goto cleanup;
    }
    if (wcsnlen(argv[1], MAX_PROMPT_CHARS + 1) > MAX_PROMPT_CHARS) {
        goto cleanup;
    }
    if (!request_credential(port, session_ref,
                            prompt_is_username(argv[1]) ? KIND_USERNAME
                                                       : KIND_PASSWORD,
                            credential, &credential_length)) {
        goto cleanup;
    }
    if (_setmode(_fileno(stdout), _O_BINARY) == -1 ||
        fwrite(credential, 1, (size_t)credential_length, stdout) !=
            (size_t)credential_length ||
        fwrite("\n", 1, 1, stdout) != 1 || fflush(stdout) != 0) {
        goto cleanup;
    }
    success = 1;

cleanup:
    SecureZeroMemory(credential, sizeof(credential));
    SecureZeroMemory(session_ref, sizeof(session_ref));
    SecureZeroMemory(port_text, sizeof(port_text));
    return success ? 0 : 1;
}
