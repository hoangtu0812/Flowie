-- Records when a closed ticket was last reopened; existing tickets stay null and keep following their issue.
-- VI: Ghi lần gần nhất ticket đã đóng được mở lại; ticket hiện có giữ null và vẫn theo Issue của chúng.
ALTER TABLE "asks" ADD COLUMN "reopened_at" TIMESTAMP(3);
