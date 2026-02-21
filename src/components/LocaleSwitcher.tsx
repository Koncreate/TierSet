import { getLocale, locales, setLocale } from "#/paraglide/runtime";
import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import { ComboBox, ComboBoxItem } from "./ComboBox";

export default function ParaglideLocaleSwitcher() {
  const [currentLocale, setCurrentLocale] = useState<string>("en");

  useEffect(() => {
    setCurrentLocale(getLocale());
  }, []);

  const handleSelectionChange = (key: Key | null) => {
    if (key && typeof key === "string") {
      setLocale(key);
      setCurrentLocale(key);
    }
  };

  const localeItems = locales.map((locale: string) => ({
    id: locale,
    name: locale.toUpperCase(),
  }));

  return (
    <ComboBox
      label="Language"
      placeholder="Select language"
      selectedKey={currentLocale}
      onSelectionChange={handleSelectionChange}
      items={localeItems}
      className="w-full"
    >
      {(item: { id: string; name: string }) => (
        <ComboBoxItem id={item.id}>{item.name}</ComboBoxItem>
      )}
    </ComboBox>
  );
}
