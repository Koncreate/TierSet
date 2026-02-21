"use client";
import { CaretDown } from "@phosphor-icons/react";
import {
  ComboBox as AriaComboBox,
  type ComboBoxProps as AriaComboBoxProps,
  Input,
  Label,
  FieldError,
  Text,
  ListBox,
  ListBoxItem,
  type ListBoxItemProps,
  type ValidationResult,
  Popover,
} from "react-aria-components";

export interface ComboBoxProps<T extends object> extends Omit<AriaComboBoxProps<T>, "children"> {
  label?: string;
  description?: string | null;
  errorMessage?: string | ((validation: ValidationResult) => string);
  placeholder?: string;
  children: React.ReactNode | ((item: T) => React.ReactNode);
}

export function ComboBox<T extends object>({
  label,
  description,
  errorMessage,
  children,
  items,
  placeholder,
  ...props
}: ComboBoxProps<T>) {
  return (
    <AriaComboBox {...props} className="group flex flex-col gap-1 font-sans text-white">
      {label && <Label className="text-sm font-medium opacity-85">{label}</Label>}
      <div className="relative flex items-center">
        <Input
          className="w-full px-3 py-2 pr-10 bg-gray-700 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-colors text-sm text-white placeholder:text-gray-400"
          placeholder={placeholder}
        />
        <button
          type="button"
          className="absolute right-2 p-1 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white pressed:bg-gray-500"
          aria-label="Toggle dropdown"
        >
          <CaretDown className="w-4 h-4" />
        </button>
      </div>
      {description && (
        <Text slot="description" className="text-xs opacity-75">
          {description}
        </Text>
      )}
      <FieldError className="text-xs text-red-400">{errorMessage}</FieldError>
      <Popover className="w-[--trigger-width]">
        <ListBox
          items={items}
          className="outline-0 p-1 box-border max-h-48 overflow-auto bg-gray-800 border border-gray-700 rounded-lg shadow-lg"
        >
          {children}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

export function ComboBoxItem(props: ListBoxItemProps) {
  return (
    <ListBoxItem
      {...props}
      className="px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-gray-700 focus:bg-cyan-600 focus:outline-none transition-colors selected:bg-cyan-600 selected:text-white"
    />
  );
}
