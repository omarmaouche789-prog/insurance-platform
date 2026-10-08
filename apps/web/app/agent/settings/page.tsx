"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Clock, Mail, MessageSquare, Shield, Save, AlertCircle } from "lucide-react";
import type { UserDTO } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../lib/api";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Field, Input, Select, Textarea } from "../../../components/ui/Field";
import { Switch } from "../../../components/ui/Switch";
import { Alert, LoadingState, ErrorState } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/Toast";

interface AgentPreferences {
  availabilityStart: string;
  availabilityEnd: string;
  workDays: string[];
  emailNotifications: boolean;
  smsNotifications: boolean;
  inAppNotifications: boolean;
  preferredLanguage: "en" | "ar";
  biography: string;
  timezone: string;
}

const DAYS_OF_WEEK = [
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
  { value: "SAT", label: "Saturday" },
  { value: "SUN", label: "Sunday" },
];

const TIMEZONES = [
  { value: "UTC-8", label: "Pacific Time (PT)" },
  { value: "UTC-7", label: "Mountain Time (MT)" },
  { value: "UTC-6", label: "Central Time (CT)" },
  { value: "UTC-5", label: "Eastern Time (ET)" },
  { value: "UTC+0", label: "UTC/GMT" },
  { value: "UTC+3", label: "East Africa Time (EAT)" },
];

const DEFAULT_PREFERENCES: AgentPreferences = {
  availabilityStart: "09:00",
  availabilityEnd: "17:00",
  workDays: ["MON", "TUE", "WED", "THU", "FRI"],
  emailNotifications: true,
  smsNotifications: true,
  inAppNotifications: true,
  preferredLanguage: "en",
  biography: "",
  timezone: "UTC-5",
};

export default function AgentSettingsPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const toast = useToast();

  const [preferences, setPreferences] = useState<AgentPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    // Load agent preferences from localStorage for now
    // In production, this would be an API call
    const saved = localStorage.getItem("agentPreferences");
    if (saved) {
      try {
        setPreferences(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to load preferences:", err);
      }
    }
    setLoading(false);
  }, [accessToken]);

  const canSave = !loading && !saving && dirty;

  async function handleSave() {
    if (!canSave || !accessToken) return;

    setSaving(true);
    setError(null);
    try {
      // Save to localStorage for now
      // In production, POST to /api/agent/preferences
      localStorage.setItem("agentPreferences", JSON.stringify(preferences));

      setDirty(false);
      toast.success("Settings saved successfully");
    } catch (err) {
      const msg = describeApiError(err, "Failed to save settings");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleChange<K extends keyof AgentPreferences>(key: K, value: AgentPreferences[K]) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function toggleWorkDay(day: string) {
    setPreferences((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter((d) => d !== day)
        : [...prev.workDays, day],
    }));
    setDirty(true);
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Settings" description="Manage your availability, preferences, and communication settings." />
        <LoadingState />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Manage your availability, preferences, and communication settings." />

      {error && <Alert type="error" icon={<AlertCircle />}>{error}</Alert>}

      <div className="grid gap-6">
        {/* Availability Section */}
        <Card>
          <CardHeader icon={<Clock className="h-5 w-5" />} title="Availability" />
          <CardBody className="space-y-6">
            <div>
              <h3 className="mb-4 font-semibold text-gray-900">Working Hours</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start Time">
                  <Input
                    type="time"
                    value={preferences.availabilityStart}
                    onChange={(e) => handleChange("availabilityStart", e.target.value)}
                  />
                </Field>
                <Field label="End Time">
                  <Input
                    type="time"
                    value={preferences.availabilityEnd}
                    onChange={(e) => handleChange("availabilityEnd", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-gray-900">Working Days</h3>
              <div className="flex flex-wrap gap-3">
                {DAYS_OF_WEEK.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 rounded-lg border-2 border-gray-200 px-4 py-2 cursor-pointer transition hover:border-blue-400" style={{
                    borderColor: preferences.workDays.includes(day.value) ? "#2563eb" : "#e5e7eb",
                    backgroundColor: preferences.workDays.includes(day.value) ? "#dbeafe" : "white",
                  }}>
                    <input
                      type="checkbox"
                      checked={preferences.workDays.includes(day.value)}
                      onChange={() => toggleWorkDay(day.value)}
                      className="hidden"
                    />
                    <span className="text-sm font-medium">{day.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Field label="Timezone">
              <Select
                value={preferences.timezone}
                onChange={(e) => handleChange("timezone", e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        {/* Communication Preferences Section */}
        <Card>
          <CardHeader icon={<MessageSquare className="h-5 w-5" />} title="Communication Preferences" />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Email Notifications</p>
                  <p className="text-sm text-gray-600">Receive alerts about new applications and updates</p>
                </div>
              </div>
              <Switch
                checked={preferences.emailNotifications}
                onChange={(checked) => handleChange("emailNotifications", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">SMS Notifications</p>
                  <p className="text-sm text-gray-600">Receive text messages for urgent updates</p>
                </div>
              </div>
              <Switch
                checked={preferences.smsNotifications}
                onChange={(checked) => handleChange("smsNotifications", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">In-App Notifications</p>
                  <p className="text-sm text-gray-600">See updates in your notification bell</p>
                </div>
              </div>
              <Switch
                checked={preferences.inAppNotifications}
                onChange={(checked) => handleChange("inAppNotifications", checked)}
              />
            </div>

            <Field label="Preferred Language">
              <Select
                value={preferences.preferredLanguage}
                onChange={(e) => handleChange("preferredLanguage", e.target.value as "en" | "ar")}
              >
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </Select>
            </Field>
          </CardBody>
        </Card>

        {/* Profile Section */}
        <Card>
          <CardHeader icon={<Shield className="h-5 w-5" />} title="Profile" />
          <CardBody className="space-y-4">
            <Field label="Biography">
              <Textarea
                value={preferences.biography}
                onChange={(e) => handleChange("biography", e.target.value)}
                placeholder="Tell applicants a bit about yourself..."
                rows={4}
              />
            </Field>
            <p className="text-xs text-gray-600">
              This bio will be visible to applicants when they're assigned to you.
            </p>
          </CardBody>
        </Card>

        {/* Security Section */}
        <Card>
          <CardHeader icon={<Shield className="h-5 w-5" />} title="Security" />
          <CardBody className="space-y-4">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-sm text-blue-900">
                Manage your password and two-factor authentication on the{" "}
                <a href="/agent/security" className="font-semibold underline hover:no-underline">
                  Security page
                </a>
                .
              </p>
            </div>
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
            Save Changes
          </Button>
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
