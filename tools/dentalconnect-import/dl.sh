#!/bin/bash
# usage: dl.sh <casedir>  — downloads urls.txt into <casedir>/orig/NN.<ext>
d="$1"; mkdir -p "$d/orig"; i=0
while read -r u; do [ -z "$u" ] && continue; i=$((i+1)); n=$(printf %02d $i)
  if ls "$d/orig/$n".* >/dev/null 2>&1; then continue; fi
  f="$d/orig/$n.bin"
  curl -sL -A "Mozilla/5.0" --retry 3 -o "$f" "$u" || { echo "FAIL $n"; continue; }
  t=$(file -b --mime-type "$f"); case "$t" in image/png) e=png;; image/jpeg) e=jpg;; image/webp) e=webp;; *) e=bin;; esac
  mv "$f" "$d/orig/$n.$e"; echo "$n $e $(sips -g pixelWidth -g pixelHeight "$d/orig/$n.$e" 2>/dev/null | awk '/pixel/{printf "%s ",$2}')"
done < "$d/urls.txt"
