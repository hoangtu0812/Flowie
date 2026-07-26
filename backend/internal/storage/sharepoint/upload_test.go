package sharepoint

import "testing"

func TestPlanChunksCoversTheWholeFileExactlyOnce(t *testing.T) {
	cases := []struct {
		size, chunk int64
		wantParts   int
	}{
		{size: 10, chunk: 4, wantParts: 3}, // 0-3, 4-7, 8-9
		{size: 8, chunk: 4, wantParts: 2},  // exact multiple
		{size: 3, chunk: 4, wantParts: 1},  // smaller than one chunk
		{size: 1, chunk: 1, wantParts: 1},
	}
	for _, tc := range cases {
		parts := planChunks(tc.size, tc.chunk)
		if len(parts) != tc.wantParts {
			t.Errorf("planChunks(%d,%d) produced %d parts, want %d",
				tc.size, tc.chunk, len(parts), tc.wantParts)
			continue
		}
		// Ranges must be contiguous, inclusive, and cover exactly [0, size-1].
		var covered int64
		for i, p := range parts {
			if p.End < p.Start {
				t.Errorf("part %d has End < Start (%d < %d)", i, p.End, p.Start)
			}
			if i == 0 && p.Start != 0 {
				t.Errorf("first part starts at %d, want 0", p.Start)
			}
			if i > 0 && p.Start != parts[i-1].End+1 {
				t.Errorf("gap or overlap between part %d and %d", i-1, i)
			}
			covered += p.End - p.Start + 1
		}
		if covered != tc.size {
			t.Errorf("parts cover %d bytes, want %d", covered, tc.size)
		}
		if last := parts[len(parts)-1]; last.End != tc.size-1 {
			t.Errorf("last part ends at %d, want %d", last.End, tc.size-1)
		}
	}
}

func TestPlanChunksEdgeCases(t *testing.T) {
	if got := planChunks(0, 100); got != nil {
		t.Errorf("empty file should produce no chunks, got %v", got)
	}
	if got := planChunks(-5, 100); got != nil {
		t.Errorf("negative size should produce no chunks, got %v", got)
	}
	// A non-positive chunk size must fall back to the default rather than loop.
	if got := planChunks(10, 0); len(got) != 1 {
		t.Errorf("zero chunk size should fall back to the default, got %d parts", len(got))
	}
}

func TestChunkSizeMatchesGraphRequirement(t *testing.T) {
	// Microsoft Graph requires every chunk except the last to be a multiple of
	// 320 KiB; violating this makes the upload session fail mid-way.
	const unit = 320 * 1024
	if chunkSize%unit != 0 {
		t.Errorf("chunkSize %d is not a multiple of 320 KiB", chunkSize)
	}
	if chunkSize > SimpleUploadLimit*2 {
		t.Errorf("chunkSize %d is unexpectedly large", chunkSize)
	}
}

func TestSimpleUploadLimitIs4MB(t *testing.T) {
	if SimpleUploadLimit != 4*1024*1024 {
		t.Errorf("SimpleUploadLimit = %d, want 4 MiB (Graph's plain-PUT ceiling)", SimpleUploadLimit)
	}
}
