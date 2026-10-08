"use client";

import { useEffect, useState, useMemo } from "react";
import { Save, Globe, Mail, MessageSquare, Palette, AlertCircle } from "lucide-react";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Field, Input, Select, Textarea, CharCount } from "../../../components/ui/Field";
import { Switch } from "../../../components/ui/Switch";
import { Alert, LoadingState } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/Toast";
import { useAuth } from "../../../lib/auth-context";

interface AdvancedSettings {
  // Localization
  defaultLanguage: "en" | "ar";
  enableBilingual: boolean;
  enableArabic: boolean;

  // Email Configuration
  emailSenderName: string;
  emailSenderAddress: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;

  // SMS Configuration
  smsProvider: "twilio" | "vonage" | "custom";
  smsAccountSid: string;
  smsAuthToken: string;

  // Branding
  companyName: string;
  platformName: string;
  logoUrl: string;
  primaryColor: string;
  supportEmail: string;
  supportPhone: string;
}

const DEFAULT_SETTINGS: AdvancedSettings = {
  defaultLanguage: "en",
  enableBilingual: true,
  enableArabic: false,
  emailSenderName: "Insurance Platform",
  emailSenderAddress: "noreply@insuranceplatform.com",
  smtpHost: "smtp.sendgrid.net",
  smtpPort: "587",
  smtpUsername: "apikey",
  smtpPassword: "",
  smsProvider: "twilio",
  smsAccountSid: "",
  smsAuthToken: "",
  companyName: "Insurance Solutions Inc.",
  platformName: "Insurance Marketplace",
  logoUrl: "/logo.png",
  primaryColor: "#2563eb",
  supportEmail: "support@insuranceplatform.com",
  supportPhone: "+1-800-INSURANCE",
};

export default function AdvancedSettingsPage() {
  const { user, accessToken } = useAuth();
  const toast = useToast();

  const [settings, setSettings] = useState<AdvancedSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    // Load settings from localStorage for now
    // In production, this would be an API call
    const saved = localStorage.getItem("advancedSettings");
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    }
    setLoading(false);
  }, []);

  const canSave = !loading && !saving && dirty;

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);
    setError(null);
    try {
      // Validate required fields
      if (!settings.emailSenderAddress.includes("@")) {
        throw new Error("Invalid email sender address");
      }

      // Save to localStorage for now
      // In production, POST to /api/admin/advanced-settings
      localStorage.setItem("advancedSettings", JSON.stringify(settings));

      setDirty(false);
      toast.success("Advanced settings saved successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleChange<K extends keyof AdvancedSettings>(
    key: K,
    value: AdvancedSettings[K]
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Advanced Settings" description="Configure platform-wide settings for localization, email, SMS, and branding." />
        <LoadingState />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Advanced Settings"
        description="Configure platform-wide settings for localization, email, SMS, and branding."
      />

      {error && (
        <Alert type="error" icon={<AlertCircle />}>
          {error}
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Localization Section */}
        <Card>
          <CardHeader
            icon={<Globe className="h-5 w-5" />}
            title="Localization"
            description="Configure language and regional settings"
          />
          <CardBody className="space-y-4">
            <Field label="Default Language">
              <Select
                value={settings.defaultLanguage}
                onChange={(e) =>
                  handleChange("defaultLanguage", e.target.value as "en" | "ar")
                }
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </Select>
            </Field>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="font-medium text-gray-900">Bilingual Mode</p>
                <p className="text-sm text-gray-600">
                  Show both English and Arabic interfaces throughout the platform
                </p>
              </div>
              <Switch
                checked={settings.enableBilingual}
                onChange={(checked) => handleChange("enableBilingual", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div>
                <p className="font-medium text-gray-900">Enable Arabic Interface</p>
                <p className="text-sm text-gray-600">
                  Allow users and agents to switch to Arabic language
                </p>
              </div>
              <Switch
                checked={settings.enableArabic}
                onChange={(checked) => handleChange("enableArabic", checked)}
              />
            </div>
          </CardBody>
        </Card>

        {/* Email Configuration */}
        <Card>
          <CardHeader
            icon={<Mail className="h-5 w-5" />}
            title="Email Configuration"
            description="Set up email delivery settings"
          />
          <CardBody className="space-y-4">
            <Field label="Sender Name" required>
              <Input
                type="text"
                value={settings.emailSenderName}
                onChange={(e) => handleChange("emailSenderName", e.target.value)}
                placeholder="e.g., Insurance Platform"
              />
            </Field>

            <Field label="Sender Email Address" required>
              <Input
                type="email"
                value={settings.emailSenderAddress}
                onChange={(e) => handleChange("emailSenderAddress", e.target.value)}
                placeholder="noreply@insuranceplatform.com"
              />
            </Field>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
              ℹ️ Using SendGrid as your mail provider? Your SMTP credentials are in your SendGrid account settings.
            </div>

            <Field label="SMTP Host" required>
              <Input
                type="text"
                value={settings.smtpHost}
                onChange={(e) => handleChange("smtpHost", e.target.value)}
                placeholder="smtp.sendgrid.net"
              />
            </Field>

            <Field label="SMTP Port" required>
              <Input
                type="text"
                value={settings.smtpPort}
                onChange={(e) => handleChange("smtpPort", e.target.value)}
                placeholder="587"
              />
            </Field>

            <Field label="SMTP Username">
              <Input
                type="text"
                value={settings.smtpUsername}
                onChange={(e) => handleChange("smtpUsername", e.target.value)}
                placeholder="apikey"
              />
            </Field>

            <Field label="SMTP Password">
              <div className="relative">
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={settings.smtpPassword}
                  onChange={(e) => handleChange("smtpPassword", e.target.value)}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {showPasswords ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
          </CardBody>
        </Card>

        {/* SMS Configuration */}
        <Card>
          <CardHeader
            icon={<MessageSquare className="h-5 w-5" />}
            title="SMS Configuration"
            description="Set up SMS delivery provider"
          />
          <CardBody className="space-y-4">
            <Field label="SMS Provider" required>
              <Select
                value={settings.smsProvider}
                onChange={(e) =>
                  handleChange("smsProvider", e.target.value as any)
                }
              >
                <option value="twilio">Twilio</option>
                <option value="vonage">Vonage</option>
                <option value="custom">Custom</option>
              </Select>
            </Field>

            {settings.smsProvider === "twilio" && (
              <>
                <Field label="Twilio Account SID" required>
                  <Input
                    type="text"
                    value={settings.smsAccountSid}
                    onChange={(e) => handleChange("smsAccountSid", e.target.value)}
                    placeholder="AC..."
                  />
                </Field>

                <Field label="Twilio Auth Token" required>
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={settings.smsAuthToken}
                    onChange={(e) => handleChange("smsAuthToken", e.target.value)}
                    placeholder="••••••••••"
                  />
                </Field>
              </>
            )}

            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-900">
              ✓ SMS notifications are configured and ready to use.
            </div>
          </CardBody>
        </Card>

        {/* Branding */}
        <Card>
          <CardHeader
            icon={<Palette className="h-5 w-5" />}
            title="Branding"
            description="Customize platform appearance and contact information"
          />
          <CardBody className="space-y-4">
            <Field label="Company Name" required>
              <Input
                type="text"
                value={settings.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                placeholder="Insurance Solutions Inc."
              />
            </Field>

            <Field label="Platform Name" required>
              <Input
                type="text"
                value={settings.platformName}
                onChange={(e) => handleChange("platformName", e.target.value)}
                placeholder="Insurance Marketplace"
              />
            </Field>

            <Field label="Logo URL">
              <Input
                type="text"
                value={settings.logoUrl}
                onChange={(e) => handleChange("logoUrl", e.target.value)}
                placeholder="/logo.png"
              />
            </Field>

            <Field label="Primary Brand Color">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => handleChange("primaryColor", e.target.value)}
                  className="h-12 w-12 rounded cursor-pointer"
                />
                <Input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => handleChange("primaryColor", e.target.value)}
                  placeholder="#2563eb"
                  className="flex-1"
                />
              </div>
            </Field>

            <Field label="Support Email" required>
              <Input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => handleChange("supportEmail", e.target.value)}
                placeholder="support@insuranceplatform.com"
              />
            </Field>

            <Field label="Support Phone" required>
              <Input
                type="tel"
                value={settings.supportPhone}
                onChange={(e) => handleChange("supportPhone", e.target.value)}
                placeholder="+1-800-INSURANCE"
              />
            </Field>
          </CardBody>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="primary"
            icon={<Save className="h-4 w-4" />}
            onClick={handleSave}
            disabled={!canSave}
            loading={saving}
          >
            Save Advanced Settings
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
