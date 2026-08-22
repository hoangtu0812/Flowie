import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { PrismaService } from '../database/prisma.service';

/** Creates or promotes exactly one administrator from deployment-only environment variables. */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
   private readonly logger = new Logger(AdminBootstrapService.name);

   constructor(
      private readonly prisma: PrismaService,
      private readonly config: ConfigService
   ) {}

   async onApplicationBootstrap(): Promise<void> {
      const email = this.config.get<string>('ADMIN_BOOTSTRAP_EMAIL')?.trim().toLowerCase();
      const password = this.config.get<string>('ADMIN_BOOTSTRAP_PASSWORD');
      const name = this.config.get<string>('ADMIN_BOOTSTRAP_NAME', 'Flowie Administrator');
      const resetPassword = this.config.get<string>('ADMIN_RESET_PASSWORD', 'false') === 'true';

      if (!email && !password) return;
      if (!email || !password || password.length < 12) {
         this.logger.error(
            'Platform admin bootstrap skipped: set ADMIN_BOOTSTRAP_EMAIL and a password of at least 12 characters.'
         );
         return;
      }

      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
         await this.prisma.user.update({
            where: { id: existing.id },
            data: {
               isPlatformAdmin: true,
               status: 'ACTIVE',
               ...(resetPassword
                  ? { passwordHash: await argon2.hash(password, { type: argon2.argon2id }) }
                  : {}),
            },
         });
         this.logger.log(`Platform administrator enabled for ${email}.`);
         return;
      }

      await this.prisma.user.create({
         data: {
            email,
            name,
            passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
            isPlatformAdmin: true,
            identities: {
               create: { provider: 'LOCAL', providerAccountId: email, email },
            },
         },
      });
      this.logger.log(`Platform administrator created for ${email}.`);
   }
}
