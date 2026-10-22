import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from '../../config';
import { Client } from '../../database/entities/client.entity';
import { RewardsModule } from '../rewards/rewards.module';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientAuthGuard } from '../../common/client-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
    RewardsModule,
    // Same JWT_SECRET as the admin's JwtModule — safe to share since client
    // and admin tokens use different payload shapes, different cookie
    // names, and are checked by entirely separate guards (see
    // ClientAuthGuard vs AdminAuthGuard).
    JwtModule.register({ secret: config.JWT_SECRET }),
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientAuthGuard],
  exports: [ClientAuthService, ClientAuthGuard, JwtModule],
})
export class ClientAuthModule {}
