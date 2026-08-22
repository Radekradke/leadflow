import { Controller, Get } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermissions,
} from '../../common/auth/auth.decorators';
import { AuthenticatedUser } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('operational')
  @RequirePermissions('dashboard:operational')
  operational(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.operational(user);
  }

  @Get('management')
  @RequirePermissions('dashboard:management')
  management(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.management(user);
  }
}
