import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  namespace: '/messaging',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub ?? payload.id;

      // Auto-join user room
      await client.join(`user:${client.userId}`);

      this.logger.log(
        `Client ${client.id} connected as user ${client.userId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Client ${client.id} failed authentication: ${error}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client ${client.id} disconnected (user: ${client.userId})`);
  }

  @SubscribeMessage('conversation:join')
  async handleConversationJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) return;
    await client.join(`conversation:${data.conversationId}`);
    this.logger.debug(
      `User ${client.userId} joined conversation ${data.conversationId}`,
    );
    return { event: 'conversation:joined', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('conversation:leave')
  async handleConversationLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) return;
    await client.leave(`conversation:${data.conversationId}`);
    this.logger.debug(
      `User ${client.userId} left conversation ${data.conversationId}`,
    );
    return { event: 'conversation:left', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) return;
    client.to(`conversation:${data.conversationId}`).emit('typing:start', {
      userId: client.userId,
      conversationId: data.conversationId,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) return;
    client.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      userId: client.userId,
      conversationId: data.conversationId,
    });
  }

  @SubscribeMessage('message:read')
  handleMessageRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; messageId: string },
  ) {
    if (!client.userId) return;
    client.to(`conversation:${data.conversationId}`).emit('message:read', {
      userId: client.userId,
      conversationId: data.conversationId,
      messageId: data.messageId,
    });
  }

  // ─── Server-side emit methods (called by services) ────

  emitNewMessage(conversationId: string, messageData: Record<string, unknown>) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('message:new', messageData);
  }

  emitConversationUpdate(
    conversationId: string,
    updateData: Record<string, unknown>,
  ) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('conversation:updated', updateData);
  }

  /**
   * Server-pushed timeline event (status change, landing-sent, etc.). The web
   * client merges these into the rendered timeline alongside `message:new`.
   */
  emitConversationEvent(conversationId: string, eventData: Record<string, unknown>) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('conversation:event', eventData);
  }

  emitNotification(userId: string, notification: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  private extractToken(client: Socket): string | null {
    // Try query param first
    const queryToken = client.handshake.query?.['token'] as string | undefined;
    if (queryToken) return queryToken;

    // Try auth header
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try auth object (socket.io v4)
    const authToken = (client.handshake.auth as Record<string, unknown>)?.['token'] as
      | string
      | undefined;
    if (authToken) return authToken;

    return null;
  }
}
