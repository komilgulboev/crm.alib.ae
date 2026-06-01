//go:build embed

package main

import "embed"

//go:embed dist
var staticFiles embed.FS

var useEmbedded = true
