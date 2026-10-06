"use client";

import { useTranslation } from "react-i18next";
import { ZipSearchForm } from "./ZipSearchForm";

const SAMPLE_ZIPS = ["90001", "94103", "10001", "11201", "78701", "33101"];

export function HomeHero() {
  const { t, i18n } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-3xl font-bold">{t("home.title")}</h1>
      <p className="mt-4 text-gray-600">{t("home.subtitle")}</p>
      <div className="mt-8 flex justify-center">
        <ZipSearchForm />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {t("home.tryZips", { zips: SAMPLE_ZIPS.join(i18n.language === "ar" ? "، " : ", ") })}
      </p>
    </div>
  );
}
