#!/usr/bin/env bash

set -e

BUILD_DIR="$1"
ZIP_NAME="$2"

pushd ${BUILD_DIR}/dist && zip -r ../../${ZIP_NAME} . && popd
