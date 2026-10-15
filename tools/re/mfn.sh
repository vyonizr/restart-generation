#!/bin/bash
# usage: mfn.sh name-or-addr... prints Mac decompiled functions (match by name or addr suffix; MAC_DECOMP overrides analysis/tr/mac_named.c)
F=${MAC_DECOMP:-analysis/tr/mac_named.c}
for a in "$@"; do awk -v a="$a" '/^\/\/ ==== /{p=($3==a || $NF==a)} p' "$F" | grep -v "^$"; done
