import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map userId -> Set of socket IDs (a user can have multiple tabs)
  private userSockets = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    if (!token) return client.disconnect();

    try {
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'wallora-super-secret-key-2026-v1');
      const userId = decoded.sub;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)?.add(client.id);
      console.log(`📡 Socket connected: ${client.id} for user ${userId}`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
     this.userSockets.forEach((sockets, userId) => {
       if (sockets.has(client.id)) {
         sockets.delete(client.id);
         if (sockets.size === 0) this.userSockets.delete(userId);
       }
     });
     console.log(`🔌 Socket disconnected: ${client.id}`);
  }

  sendNotification(userId: string, data: { type: string; title: string; message: string; amount?: number }) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach(socketId => {
        this.server.to(socketId).emit('notification', data);
      });
    }
  }
}
