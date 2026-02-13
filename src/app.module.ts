import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketGateway } from './socket/socket.gateway';
import { CollabGateway } from './collab/collab.gatewat';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, SocketGateway, CollabGateway],
})
export class AppModule {}
