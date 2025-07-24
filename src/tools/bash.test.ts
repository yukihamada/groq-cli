import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BashTool } from './bash';

// Mock the confirmation service
vi.mock('../utils/confirmation-service', () => ({
  ConfirmationService: {
    getInstance: vi.fn(() => ({
      getSessionFlags: vi.fn(() => ({ bashCommands: true, allOperations: false })),
      requestConfirmation: vi.fn().mockResolvedValue({ confirmed: true })
    }))
  }
}));

describe('BashTool', () => {
  let bashTool: BashTool;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.chdir mock
    vi.spyOn(process, 'chdir').mockImplementation(() => {});
    bashTool = new BashTool();
  });

  describe('execute', () => {
    it('should handle cd command successfully', async () => {
      const result = await bashTool.execute('cd /tmp');

      expect(result.success).toBe(true);
      expect(result.output).toContain('Changed directory to:');
      expect(process.chdir).toHaveBeenCalledWith('/tmp');
    });

    it('should handle cd to home directory', async () => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '/';
      const result = await bashTool.execute('cd ~');

      expect(result.success).toBe(true);
      expect(process.chdir).toHaveBeenCalledWith('~');
    });

    it('should handle cd with spaces in path', async () => {
      const result = await bashTool.execute('cd "/path with spaces"');

      expect(result.success).toBe(true);
      expect(process.chdir).toHaveBeenCalledWith('"/path with spaces"');
    });

    it('should handle cd failure', async () => {
      vi.spyOn(process, 'chdir').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await bashTool.execute('cd /nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot change directory');
    });

    it('should handle empty command', async () => {
      const result = await bashTool.execute('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No command provided');
    });
  });

  describe('getCurrentDirectory', () => {
    it('should return current working directory', () => {
      const cwd = bashTool.getCurrentDirectory();
      expect(cwd).toBe(process.cwd());
    });
  });
});