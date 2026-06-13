"use client";

import { useEffect, useState } from "react";

type NumericInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function stripLeadingZeros(digits: string): string {
  if (digits === "") return "";
  return digits.replace(/^0+/, "") || "0";
}

function digitsToNumber(digits: string): number {
  if (digits === "") return 0;
  return Number(digits);
}

export function NumericInput({ id, value, onChange, min, max }: NumericInputProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(String(value));
    }
  }, [value, focused]);

  function commitDisplay(raw: string, clamp: boolean): number {
    const normalized = stripLeadingZeros(sanitizeDigits(raw));
    let n = digitsToNumber(normalized);
    if (clamp) {
      if (min !== undefined) n = Math.max(min, n);
      if (max !== undefined) n = Math.min(max, n);
    }
    return n;
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        if (e.currentTarget.value === "0") {
          e.currentTarget.select();
        }
      }}
      onBlur={() => {
        setFocused(false);
        const n = commitDisplay(text, true);
        onChange(n);
        setText(String(n));
      }}
      onChange={(e) => {
        const normalized = stripLeadingZeros(sanitizeDigits(e.target.value));
        setText(normalized);
        onChange(digitsToNumber(normalized));
      }}
    />
  );
}
