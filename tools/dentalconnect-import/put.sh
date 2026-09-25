#!/bin/bash
# usage: put.sh <line-number in upload/puts.tsv>
D=/private/tmp/claude-501/-Users-msj-pflive/d97e473b-ff17-4c6e-8c6d-a30de5894110/scratchpad/dc
line=$(sed -n "${1}p" "$D/upload/puts.tsv")
IFS=$'\t' read -r key file ctype <<< "$line"
cd /Users/msj/patient-series/patient-connector || exit 1
for i in 1 2 3; do
  if npx wrangler r2 object put "patient-connect-assets/$key" --file="$file" --content-type="$ctype" --remote >>"$D/upload/put_err.log" 2>&1; then echo "OK $key"; exit 0; fi
  sleep 3
done
echo "FAIL $key"
