#!/bin/zsh
# launchd 에서 3시간마다 실행. 드라이브 폴더 변화를 커넥트 라이브러리에 반영.
export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.." || exit 1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') sync start"
python3 tools/drive_library_sync.py "$@"
echo "===== $(date '+%Y-%m-%d %H:%M:%S') sync end (exit $?)"
