import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

const publicUserSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  phone: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: publicUserSelect,
    });
    if (!user) {
      throw new UnauthorizedException('User account is inactive');
    }
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    await this.prisma.user.updateMany({
      where: { id: userId, isActive: true },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
      },
    });
    return this.findMe(userId);
  }
}
