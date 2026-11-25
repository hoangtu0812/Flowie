-- Service Desk support tiers: a team marked tier 1, 2 or 3 can receive tickets moved from another
-- team. Additive only; existing teams have no tier, so nothing moves until someone sets one.
-- VI: Cấp hỗ trợ Service Desk: team được đánh dấu cấp 1, 2 hoặc 3 nhận được ticket chuyển từ team
-- VI: khác. Chỉ thêm mới; team hiện có chưa có cấp, nên chưa có gì chuyển cho tới khi có người đặt cấp.
-- AlterTable
ALTER TABLE "teams" ADD COLUMN "support_tier" INTEGER;
