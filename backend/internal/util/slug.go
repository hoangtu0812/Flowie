// Package util holds small shared helpers.
package util

import (
	"regexp"
	"strings"
)

var (
	nonAlnum   = regexp.MustCompile(`[^a-z0-9]+`)
	trimDashes = regexp.MustCompile(`^-+|-+$`)
)

// Slugify converts an arbitrary string into a URL/folder-safe slug.
func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonAlnum.ReplaceAllString(s, "-")
	s = trimDashes.ReplaceAllString(s, "")
	if s == "" {
		return "item"
	}
	return s
}
