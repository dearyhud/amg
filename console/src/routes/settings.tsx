import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useSettings, useUpdateSettings } from "@/api/queries/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

function ListEditor({
  items,
  onChange,
  placeholder,
  mono = true,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className={mono ? "font-mono" : undefined}>
            {item}
            <button
              type="button"
              aria-label={`remove ${item}`}
              onClick={() => onChange(items.filter((i) => i !== item))}
              className="ml-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          className={mono ? "max-w-72 font-mono" : "max-w-72"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={add} aria-label="add">
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const update = useUpdateSettings();

  const [admins, setAdmins] = useState<string[]>([]);
  const [webhook, setWebhook] = useState("");
  const [redactions, setRedactions] = useState<string[]>([]);

  useEffect(() => {
    if (settings.data) {
      setAdmins(settings.data.allowed_admins);
      setWebhook(settings.data.slack_webhook_url ?? "");
      setRedactions(settings.data.redaction_defaults);
    }
  }, [settings.data]);

  if (settings.isPending) return <Skeleton className="h-96 w-full" />;

  const save = () =>
    update.mutate(
      {
        allowed_admins: admins,
        slack_webhook_url: webhook || null,
        redaction_defaults: redactions,
      },
      {
        onSuccess: () => toast.success("Settings saved"),
        onError: () => toast.error("save failed"),
      },
    );

  return (
    <>
      <PageHeader
        title="Settings"
        actions={
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save settings"}
          </Button>
        }
      />

      <div className="grid max-w-2xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin allow-list</CardTitle>
            <CardDescription>
              Who can sign into this console. Enforced server-side at the OAuth callback — this
              list is the authority, not the UI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ListEditor items={admins} onChange={setAdmins} placeholder="admin@example.com" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approvals Slack webhook</CardTitle>
            <CardDescription>Parked calls notify this channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="slack-webhook" className="sr-only">
              Slack webhook URL
            </Label>
            <Input
              id="slack-webhook"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              className="font-mono"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default redaction fields</CardTitle>
            <CardDescription>
              Argument keys redacted from every audit event before persistence, in addition to
              per-tool policy redactions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ListEditor items={redactions} onChange={setRedactions} placeholder="customer_email" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
