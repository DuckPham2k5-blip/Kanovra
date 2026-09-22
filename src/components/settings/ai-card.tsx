"use client";

import { Bot, Sparkles } from "lucide-react";
import * as React from "react";

import { SettingRow, SettingsCard } from "@/components/settings/settings-ui";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/**
 * The AI preferences that the assistant page genuinely reads.
 *
 * Every value here lives in the same `localStorage` keys the assistant already
 * consumes (`tf-ai-*`), so this card is a second door onto the same settings,
 * not a decorative copy. The context box is the very "About you" note the
 * assistant sends with each question.
 */

const KEYS = {
  profile: "tf-ai-profile",
  memory: "tf-ai-memory",
  style: "tf-ai-style",
  tone: "tf-ai-tone",
  model: "tf-ai-model",
} as const;

const STYLES = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "casual", label: "Casual" },
];

const CONTEXT_LIMIT = 800;

function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: applies this session only.
  }
}

export function AiCard({ models }: { models: { id: string; label: string }[] }) {
  const [context, setContext] = React.useState("");
  const [memory, setMemory] = React.useState(true);
  const [style, setStyle] = React.useState("balanced");
  const [tone, setTone] = React.useState("professional");
  const [model, setModel] = React.useState("");

  React.useEffect(() => {
    setContext(read(KEYS.profile, ""));
    setMemory(read(KEYS.memory, "1") !== "0");
    setStyle(read(KEYS.style, "balanced"));
    setTone(read(KEYS.tone, "professional"));
    setModel(read(KEYS.model, ""));
  }, []);

  return (
    <SettingsCard
      id="ai"
      icon={Sparkles}
      title="AI Assistant"
      description="Customize how Kanovra AI works with you."
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Response style</Label>
            <Select
              value={style}
              onValueChange={(v) => {
                setStyle(v);
                write(KEYS.style, v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tone</Label>
            <Select
              value={tone}
              onValueChange={(v) => {
                setTone(v);
                write(KEYS.tone, v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Personal context — the real "About you" note. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-context">Personal context</Label>
            <span className="text-[11px] text-muted-foreground">
              {context.length}/{CONTEXT_LIMIT}
            </span>
          </div>
          <Textarea
            id="ai-context"
            value={context}
            maxLength={CONTEXT_LIMIT}
            onChange={(e) => {
              setContext(e.target.value);
              write(KEYS.profile, e.target.value);
            }}
            placeholder="Tell the assistant who you are, what you're working on, your preferred language — it uses this to answer you better."
            className="min-h-[92px] resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Sent with each question so the assistant can match your language and interests.
          </p>
        </div>

        <div className="divide-y">
          <SettingRow
            label="AI memory"
            description="Let the assistant use your personal context. Off = each chat starts blank."
            control={
              <Switch
                checked={memory}
                onCheckedChange={(v) => {
                  setMemory(v);
                  write(KEYS.memory, v ? "1" : "0");
                }}
                aria-label="AI memory"
              />
            }
          />
        </div>

        {/* Default model */}
        <div className="space-y-1.5">
          <Label>Default AI model</Label>
          {models.length > 0 ? (
            <Select
              value={model || models[0]?.id}
              onValueChange={(v) => {
                setModel(v);
                write(KEYS.model, v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              The free built-in assistant is always available. Add a provider key to unlock more models.
            </p>
          )}
        </div>

        {/* Honest shell: no per-source gating exists yet. */}
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium">Allow AI to use</span>
            <Badge variant="secondary" className="text-[11px] font-normal">
              Sắp có
            </Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {["Current project context", "Current task context", "Workspace context", "Web search (when needed)"].map(
              (label) => (
                <label
                  key={label}
                  className="flex cursor-not-allowed items-center gap-2 text-xs text-muted-foreground"
                >
                  <Checkbox disabled />
                  {label}
                </label>
              ),
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Per-source grounding isn&apos;t wired up yet — the assistant is grounded in the product guide today.
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}
