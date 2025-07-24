import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { GroqMessage } from '../groq/groq-client';

export interface Session {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  messages: GroqMessage[];
  workingDirectory: string;
  title?: string;
}

export interface SessionMetadata {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title?: string;
  messageCount: number;
  workingDirectory: string;
}

export class SessionManager {
  private sessionsDir: string;
  private currentSession: Session | null = null;

  constructor() {
    const homeDir = os.homedir();
    this.sessionsDir = path.join(homeDir, '.groq', 'sessions');
    // Create directory synchronously in constructor
    fs.ensureDirSync(this.sessionsDir);
  }

  private async ensureSessionsDirectory(): Promise<void> {
    await fs.ensureDir(this.sessionsDir);
  }

  async createSession(workingDirectory: string = process.cwd()): Promise<Session> {
    const session: Session = {
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      workingDirectory
    };

    await this.saveSession(session);
    this.currentSession = session;
    return session;
  }

  async saveSession(session: Session): Promise<void> {
    await this.ensureSessionsDirectory(); // Ensure directory exists
    const sessionPath = path.join(this.sessionsDir, `${session.id}.json`);
    session.updatedAt = new Date();
    await fs.writeJson(sessionPath, session, { spaces: 2 });
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
      const session = await fs.readJson(sessionPath);
      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      this.currentSession = session;
      return session;
    } catch (error) {
      return null;
    }
  }

  async getLastSession(): Promise<Session | null> {
    const sessions = await this.listSessions();
    if (sessions.length === 0) return null;
    
    // Sort by updatedAt descending
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return this.loadSession(sessions[0].id);
  }

  async listSessions(): Promise<SessionMetadata[]> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter(f => f.endsWith('.json'));
      
      const sessions: SessionMetadata[] = [];
      for (const file of sessionFiles) {
        const sessionPath = path.join(this.sessionsDir, file);
        try {
          const sessionData = await fs.readJson(sessionPath);
          sessions.push({
            id: sessionData.id,
            createdAt: new Date(sessionData.createdAt),
            updatedAt: new Date(sessionData.updatedAt),
            title: sessionData.title || this.generateTitle(sessionData.messages),
            messageCount: sessionData.messages.length,
            workingDirectory: sessionData.workingDirectory
          });
        } catch (error) {
          // Skip corrupted session files
          continue;
        }
      }
      
      return sessions;
    } catch (error) {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.remove(sessionPath);
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async deleteOldSessions(daysToKeep: number = 30): Promise<number> {
    const sessions = await this.listSessions();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let deletedCount = 0;
    for (const session of sessions) {
      if (session.updatedAt < cutoffDate) {
        if (await this.deleteSession(session.id)) {
          deletedCount++;
        }
      }
    }
    
    return deletedCount;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  setCurrentSession(session: Session): void {
    this.currentSession = session;
  }

  async addMessageToCurrentSession(message: GroqMessage): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    
    this.currentSession.messages.push(message);
    await this.saveSession(this.currentSession);
  }

  private generateTitle(messages: GroqMessage[]): string {
    // Generate a title from the first user message
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage || typeof firstUserMessage.content !== 'string') {
      return 'Untitled Session';
    }
    
    const content = firstUserMessage.content;
    const maxLength = 50;
    if (content.length <= maxLength) {
      return content;
    }
    
    return content.substring(0, maxLength - 3) + '...';
  }

  async setSessionTitle(sessionId: string, title: string): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    if (!session) return false;
    
    session.title = title;
    await this.saveSession(session);
    return true;
  }
}