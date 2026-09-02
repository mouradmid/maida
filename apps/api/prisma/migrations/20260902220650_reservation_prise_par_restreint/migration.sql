-- DropForeignKey
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_priseParId_fkey";

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_priseParId_fkey" FOREIGN KEY ("priseParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
