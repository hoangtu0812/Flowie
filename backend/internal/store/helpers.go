package store

import "strings"

// prefixCols returns a comma-separated column list with each column prefixed by
// the given table alias, e.g. prefixCols("w", "id, name") => "w.id, w.name".
func prefixCols(alias, cols string) string {
	parts := strings.Split(cols, ",")
	for i, p := range parts {
		parts[i] = alias + "." + strings.TrimSpace(p)
	}
	return strings.Join(parts, ", ")
}
