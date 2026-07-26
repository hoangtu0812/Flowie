package store

import "testing"

func TestPctDelta(t *testing.T) {
	cases := []struct {
		name      string
		cur, prev int
		want      float64
	}{
		{"growth", 150, 100, 50},
		{"decline", 50, 100, -50},
		{"flat", 100, 100, 0},
		// Guard against division by zero: no previous data.
		{"from zero counts as +100%", 5, 0, 100},
		{"both empty is 0%, not NaN", 0, 0, 0},
		{"dropped to zero", 0, 20, -100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := pctDelta(tc.cur, tc.prev); got != tc.want {
				t.Errorf("pctDelta(%d, %d) = %v, want %v", tc.cur, tc.prev, got, tc.want)
			}
		})
	}
}
