import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from '../permission/entities/user-role.entity';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto, ResetPasswordDto } from './dto/user.dto';
import { hashPassword, comparePassword } from '../../common/utils/crypto.util';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
  ) {}

  async findAll(query: PaginationDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [list, total] = await this.userRepo.findAndCount({
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    // 获取每个用户的角色
    const usersWithRoles = await Promise.all(
      list.map(async (user) => {
        const userRoles = await this.userRoleRepo.find({
          where: { userId: user.id },
          relations: ['role'],
        });
        const { passwordHash, ...rest } = user;
        return { ...rest, roles: userRoles.map((ur) => ur.role) };
      }),
    );

    return { list: usersWithRoles, total, page, pageSize };
  }

  async findOne(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const userRoles = await this.userRoleRepo.find({
      where: { userId: id },
      relations: ['role'],
    });
    const { passwordHash, ...rest } = user;
    return { ...rest, roles: userRoles.map((ur) => ur.role) };
  }

  async create(dto: CreateUserDto) {
    const exists = await this.userRepo.findOne({ where: { username: dto.username } });
    if (exists) throw new ConflictException('用户名已存在');

    const user = this.userRepo.create({
      username: dto.username,
      passwordHash: await hashPassword(dto.password),
      nickname: dto.nickname || dto.username,
      email: dto.email,
    });
    const saved = await this.userRepo.save(user);

    if (dto.roleIds?.length) {
      const userRoles = dto.roleIds.map((roleId) =>
        this.userRoleRepo.create({ userId: saved.id, roleId }),
      );
      await this.userRoleRepo.save(userRoles);
    }

    return { id: saved.id, username: saved.username };
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.status !== undefined) user.status = dto.status;
    await this.userRepo.save(user);

    if (dto.roleIds !== undefined) {
      await this.userRoleRepo.delete({ userId: id });
      if (dto.roleIds.length) {
        const userRoles = dto.roleIds.map((roleId) =>
          this.userRoleRepo.create({ userId: id, roleId }),
        );
        await this.userRoleRepo.save(userRoles);
      }
    }

    return { id };
  }

  async remove(id: number) {
    await this.userRoleRepo.delete({ userId: id });
    await this.userRepo.delete(id);
    return { id };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const isMatch = await comparePassword(dto.oldPassword, user.passwordHash);
    if (!isMatch) throw new BadRequestException('旧密码错误');
    user.passwordHash = await hashPassword(dto.newPassword);
    await this.userRepo.save(user);
    return { message: '密码修改成功' };
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.passwordHash = await hashPassword(dto.newPassword);
    await this.userRepo.save(user);
    return { message: '密码重置成功' };
  }
}
