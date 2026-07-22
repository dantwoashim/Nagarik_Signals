#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../programs/nagarik_signal"
anchor build
anchor deploy --provider.cluster devnet
