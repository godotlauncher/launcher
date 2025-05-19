' Usage:
' wscript elevate_symlink.vbs "target1|path1|file" "target2|path2|dir" ...

Set shell = CreateObject("Shell.Application")
Set args = WScript.Arguments

If args.Count = 0 Then
    WScript.Echo "Usage: wscript elevate_symlink.vbs ""target|path|type"" ..."
    WScript.Quit 1
End If

cmd = ""

For i = 0 To args.Count - 1
    parts = Split(args(i), "|")
    If UBound(parts) < 1 Then
        WScript.Echo "Invalid argument: " & args(i)
        WScript.Quit 1
    End If

    target = parts(0)
    path = parts(1)
    argType = "file"
    If UBound(parts) >= 2 Then
        argType = LCase(Trim(parts(2)))
    End If

    Select Case argType
        Case "dir"
            mkSwitch = "/D"
        Case "junction"
            mkSwitch = "/J"
        Case "hard"
            mkSwitch = "/H"
        Case Else
            mkSwitch = ""
    End Select

    cmd = cmd & "mklink " & mkSwitch & " """ & path & """ """ & target & """" & " & "
Next

' Remove trailing ampersand
If Right(cmd, 2) = " &" Then
    cmd = Left(cmd, Len(cmd) - 3)
End If

shell.ShellExecute "cmd.exe", "/c " & cmd, "", "runas", 1
