//go:build !embed

package main

import "embed"

var staticFiles embed.FS

var useEmbedded = false
