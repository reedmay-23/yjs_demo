import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAuthDto {
  // @ApiProperty({
  //   description: '用户名',
  //   example: '用户',
  // })
  // @IsString({ message: '用户名必须是字符串' })
  // @IsNotEmpty({ message: '用户名不能为空' })
  // username: string;

  @ApiProperty({
    description: '账号',
    example: 'system',
  })
  @IsString({ message: '账号必须是字符串' })
  @IsNotEmpty({ message: '账号不能为空' })
  account: string;

  @ApiProperty({
    description: '密码',
    example: 'system',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(20, { message: '密码最多 20 个字符' })
  password: string;
}
