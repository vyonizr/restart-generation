#!/bin/bash
# usage: fn.sh addr... prints decompiled function(s) from rg_decomp2.c (DECOMP overrides analysis/rg_decomp2.c)
F=${DECOMP:-analysis/rg_decomp2.c}
for a in "$@"; do awk -v a="$a" '/^\/\/ ====/{p=(($NF "")==(a ""))} p' "$F" | grep -v "^$"; done
