import type { ReactNode } from 'react';

export interface StudioNoticeProps {
  /** Describe the result in words; tone must not be the only error indicator. */
  children: ReactNode;
  tone?: 'info' | 'error';
  /** The host controls placement and lifetime, including toast positioning. */
  className?: string;
}
