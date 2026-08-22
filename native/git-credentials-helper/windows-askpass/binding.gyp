{
    "targets": [
        {
            "target_name": "godot-launcher-git-askpass",
            "type": "executable",
            "sources": ["windows-askpass.c", "version-resource.rc"],
            "defines": [
                "UNICODE",
                "_UNICODE",
                "_CRT_SECURE_NO_WARNINGS",
                "_WIN32_WINNT=0x0A00"
            ],
            "libraries": ["ws2_32.lib"],
            "msvs_settings": {
                "VCCLCompilerTool": {
                    "AdditionalOptions": ["/guard:cf", "/sdl", "/utf-8"],
                    "BufferSecurityCheck": "true",
                    "ExceptionHandling": "0",
                    "RuntimeLibrary": "0",
                    "TreatWarningAsError": "true",
                    "WarningLevel": "4"
                },
                "VCLinkerTool": {
                    "AdditionalOptions": ["/guard:cf", "/dynamicbase", "/nxcompat"],
                    "DataExecutionPrevention": "2",
                    "RandomizedBaseAddress": "2",
                    "SubSystem": "1"
                }
            }
        }
    ]
}
