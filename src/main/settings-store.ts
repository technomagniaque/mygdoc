import * as fs from 'fs';
import { getSettingsFilePath } from './app-paths';
import { CustomService } from '../shared/types';

export interface AppSettings {
  sidebarCollapsed: boolean;
  remoteBridgeEnabled: boolean;
  remoteBridgePaused: boolean;
  customServices: CustomService[];
}

const DEFAULT_SETTINGS: AppSettings = {
  sidebarCollapsed: false,
  remoteBridgeEnabled: true,
  remoteBridgePaused: false,
  customServices: [
    {
      id: 'gemini',
      name: 'Gemini',
      url: 'https://gemini.google.com',
      iconText: '✦',
    },
  ],
};

export class SettingsStore {
  private readonly filePath: string;
  private data: AppSettings;

  constructor(customPath?: string) {
    this.filePath = customPath || getSettingsFilePath();
    this.data = this.load();
  }

  private load(): AppSettings {
    if (!fs.existsSync(this.filePath)) {
      return { ...DEFAULT_SETTINGS, customServices: [...DEFAULT_SETTINGS.customServices] };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<AppSettings>;
      return {
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
        remoteBridgeEnabled: parsed.remoteBridgeEnabled !== false,
        remoteBridgePaused: Boolean(parsed.remoteBridgePaused),
        customServices: Array.isArray(parsed.customServices)
          ? parsed.customServices
          : [...DEFAULT_SETTINGS.customServices],
      };
    } catch {
      return { ...DEFAULT_SETTINGS, customServices: [...DEFAULT_SETTINGS.customServices] };
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  get(): AppSettings {
    return this.data;
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.data.sidebarCollapsed = collapsed;
    this.save();
  }

  setRemoteBridgeEnabled(enabled: boolean): void {
    this.data.remoteBridgeEnabled = enabled;
    this.save();
  }

  setRemoteBridgePaused(paused: boolean): void {
    this.data.remoteBridgePaused = paused;
    this.save();
  }

  addCustomService(service: Omit<CustomService, 'id'>): CustomService {
    const created: CustomService = {
      ...service,
      id: `custom-${Date.now()}`,
    };
    this.data.customServices.push(created);
    this.save();
    return created;
  }

  removeCustomService(serviceId: string): void {
    this.data.customServices = this.data.customServices.filter((s) => s.id !== serviceId);
    this.save();
  }
}
