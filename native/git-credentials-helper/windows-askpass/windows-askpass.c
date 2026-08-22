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
#define MAX_CREDENTIAL_BYTES 8192
#define SESSION_REF_LENGTH 43
#define TIMEOUT_MS 5000
#define REQUEST_BYTES 49
#define RESPONSE_HEADER_BYTES 8
#define PROTOCOL_VERSION 1
#define KIND_USERNAME 1
#define KIND_PASSWORD 2

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

static int request_credential(unsigned short port, const char *session_ref,
                              unsigned char kind, unsigned char *credential,
                              int *credential_length) {
    WSADATA winsock_data;
    SOCKET socket_handle = INVALID_SOCKET;
    struct sockaddr_in address;
    DWORD timeout = TIMEOUT_MS;
    unsigned char request[REQUEST_BYTES];
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
    memcpy(request, "GLAP", 4);
    request[4] = PROTOCOL_VERSION;
    request[5] = kind;
    memcpy(request + 6, session_ref, SESSION_REF_LENGTH);
    if (!send_all(socket_handle, request, REQUEST_BYTES) ||
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
    SecureZeroMemory(request, sizeof(request));
    SecureZeroMemory(response_header, sizeof(response_header));
    if (socket_handle != INVALID_SOCKET) {
        closesocket(socket_handle);
    }
    WSACleanup();
    return result;
}

int wmain(int argc, wchar_t **argv) {
    char port_text[16];
    char session_ref[64];
    unsigned short port;
    unsigned char credential[MAX_CREDENTIAL_BYTES];
    int credential_length = 0;
    int success = 0;
    if (argc != 2 || argv[1][0] == L'\0' ||
        wcsnlen(argv[1], MAX_PROMPT_CHARS + 1) > MAX_PROMPT_CHARS ||
        !read_environment(L"GODOT_LAUNCHER_GIT_CREDENTIAL_PORT", port_text,
                          sizeof(port_text)) ||
        !read_environment(L"GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION", session_ref,
                          sizeof(session_ref)) ||
        !parse_port(port_text, &port) || !is_session_ref(session_ref)) {
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
