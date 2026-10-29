import { z } from 'zod';

export const botConfigSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().max(600).default(''),
  tone: z.string().max(200).default('Friendly, concise and professional'),
  systemPrompt: z.string().max(6000).default(''),
  guidelines: z.string().max(3000).default(''),
  restrictions: z.string().max(3000).default(''),
  fallback: z.string().max(500).default("I'm not sure about that. Would you like me to connect you with our team?"),
  welcome: z.string().max(300).default('Hi! How can I help you today?'),
  suggested: z.array(z.string().max(100)).max(4).default([]),
  useKnowledge: z.boolean().default(false),
  useShopify: z.boolean().default(false),
  model: z.string().max(80).default(''),
  temperature: z.number().min(0).max(1).default(0.3),
  maxReplyTokens: z.number().int().min(100).max(1200).default(500),
  escalation: z.object({
    enabled: z.boolean().default(true),
    message: z.string().max(400).default('I\'ll pass this to our team. Please use the contact details below.'),
    email: z.string().max(200).default(''),
    url: z.string().max(300).default(''),
  }).default({}),
  widget: z.object({
    title: z.string().max(60).default('Support'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0F766E'),
    position: z.enum(['right', 'left']).default('right'),
    avatar: z.string().max(500).default(''),
    allowedDomains: z.array(z.string().max(200)).max(20).default([]),
  }).default({}),
});
export type BotConfig = z.infer<typeof botConfigSchema>;
export const defaultConfig = (name: string, over: Partial<BotConfig> = {}): BotConfig => botConfigSchema.parse({ name, ...over });
