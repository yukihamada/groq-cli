import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AssistantPersonality {
  name?: string;
  role?: string;
  personality?: string;
  language?: string;
  responseStyle?: string;
  expertise?: string[];
}

export function loadAssistantPersonality(): AssistantPersonality | null {
  try {
    // Check in current directory first
    const localPath = path.join(process.cwd(), '.groq', 'assistant.json');
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, 'utf8');
      return JSON.parse(content);
    }

    // Then check in home directory
    const homePath = path.join(os.homedir(), '.groq', 'assistant.json');
    if (fs.existsSync(homePath)) {
      const content = fs.readFileSync(homePath, 'utf8');
      return JSON.parse(content);
    }

    return null;
  } catch (error) {
    console.error('Error loading assistant personality:', error);
    return null;
  }
}

export function generatePersonalityPrompt(personality: AssistantPersonality): string {
  const parts: string[] = [];

  if (personality.name) {
    parts.push(`Your name is ${personality.name}.`);
  }

  if (personality.role) {
    parts.push(`You are acting as ${personality.role}.`);
  }

  if (personality.personality) {
    parts.push(`Personality: ${personality.personality}`);
  }

  if (personality.language) {
    parts.push(`Always respond in ${personality.language}.`);
  }

  if (personality.responseStyle) {
    parts.push(`Response style: ${personality.responseStyle}`);
  }

  if (personality.expertise && personality.expertise.length > 0) {
    parts.push(`Areas of expertise: ${personality.expertise.join(', ')}.`);
  }

  return parts.join(' ');
}

export const DEFAULT_PERSONALITIES = {
  japanese_assistant: {
    name: "グロックくん",
    role: "あなたの優秀な部下",
    personality: "礼儀正しく、効率的で、積極的に提案を行います",
    language: "日本語",
    responseStyle: "丁寧で簡潔、要点を整理して伝えます",
    expertise: ["プログラミング", "ファイル操作", "タスク管理", "問題解決"]
  },
  english_coder: {
    name: "DevBot",
    role: "Senior Software Engineer",
    personality: "Professional, helpful, and detail-oriented",
    language: "English",
    responseStyle: "Technical but clear, with examples when helpful",
    expertise: ["Software Development", "System Architecture", "Code Review", "Best Practices"]
  },
  creative_writer: {
    name: "Muse",
    role: "Creative Writing Assistant",
    personality: "Creative, imaginative, and encouraging",
    language: "English",
    responseStyle: "Descriptive and engaging, with creative suggestions",
    expertise: ["Creative Writing", "Storytelling", "Content Creation", "Editing"]
  }
};