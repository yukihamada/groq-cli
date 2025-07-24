import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TextEditorTool } from './text-editor';

// Mock the confirmation service
vi.mock('../utils/confirmation-service', () => ({
  ConfirmationService: {
    getInstance: vi.fn(() => ({
      getSessionFlags: vi.fn(() => ({ fileOperations: true, allOperations: false })),
      requestConfirmation: vi.fn().mockResolvedValue({ confirmed: true })
    }))
  }
}));

describe('TextEditorTool', () => {
  let textEditor: TextEditorTool;

  beforeEach(() => {
    vi.clearAllMocks();
    textEditor = new TextEditorTool();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('view', () => {
    it('should handle file not found', async () => {
      const result = await textEditor.view('nonexistent.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File or directory not found');
    });
  });

  describe('create', () => {
    it('should not overwrite existing file', async () => {
      // Mock fs.exists to return true for existing file
      const fs = require('fs-extra');
      vi.spyOn(fs, 'exists').mockResolvedValue(true);

      const result = await textEditor.create('existing.txt', 'Content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should handle creation errors', async () => {
      const fs = require('fs-extra');
      vi.spyOn(fs, 'exists').mockResolvedValue(false);
      vi.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
      vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Disk full'));

      const result = await textEditor.create('file.txt', 'Content');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disk full');
    });
  });

  describe('strReplace', () => {
    it('should handle file not found', async () => {
      const result = await textEditor.strReplace('nonexistent.txt', 'old', 'new');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });
});