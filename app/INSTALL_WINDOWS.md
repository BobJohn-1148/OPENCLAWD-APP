# Windows 11 Installer (Click-to-Run Setup)

This app is now configured for **Windows 11 installer builds** with Electron Builder + NSIS.

## Easiest path (double-click)

On a Windows 11 machine:

1. Open the `app/` folder.
2. Double-click `build-pe-installer-windows.bat` (or `build-installer-windows.bat`).
3. Wait for it to finish.
4. Grab the installer from `app\release\`.

## Generated artifacts

- `Bob Assistant-<version>-x64.exe` → NSIS one-click installer
- `Bob Assistant-<version>-x64-portable.exe` → portable EXE

## Manual commands (Windows PowerShell/CMD)

```bash
npm install
npm run installer:windows
# or explicitly produce Windows PE .exe artifacts
npm run installer:pe
```

## Optional: rebuild native deps only

```bash
npm run rebuild:electron
```

## Why build on Windows (important)

This project uses `better-sqlite3` (native module). For a working Windows app, build the installer on Windows 11 (or a Windows CI runner) so native modules are built for Windows/Electron ABI.

## Runtime location of local notes DB

The app stores local data at:

- `%APPDATA%\BobAssistant\bob.db`


## PE installer details

Both generated `.exe` artifacts are Windows PE executables:
- NSIS one-click installer (`Bob Assistant-<version>-x64.exe`)
- Portable executable (`Bob Assistant-<version>-x64-portable.exe`)
