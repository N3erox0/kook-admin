import { create } from 'zustand';
import type { GuildInfo } from '@/types';

interface GuildState {
  currentGuildId: number | null;
  currentGuildRole: string | null;
  guilds: GuildInfo[];
  setGuilds: (guilds: GuildInfo[]) => void;
  selectGuild: (guildId: number) => void;
  clearGuild: () => void;
}

export const useGuildStore = create<GuildState>((set, get) => ({
  currentGuildId: Number(localStorage.getItem('currentGuildId')) || null,
  currentGuildRole: localStorage.getItem('currentGuildRole') || null,
  guilds: [],

  setGuilds: (guilds) => {
    set({ guilds });
    const currentId = get().currentGuildId;
    if (currentId) {
      const guild = guilds.find((g) => g.guildId === currentId);
      if (guild) {
        localStorage.setItem('currentGuildRole', guild.role);
        set({ currentGuildRole: guild.role });
        return;
      }
    }
    if (guilds.length > 0) {
      const first = guilds[0];
      localStorage.setItem('currentGuildId', String(first.guildId));
      localStorage.setItem('currentGuildRole', first.role);
      set({ currentGuildId: first.guildId, currentGuildRole: first.role });
    }
  },

  selectGuild: (guildId) => {
    const guild = get().guilds.find((g) => g.guildId === guildId);
    if (guild) {
      localStorage.setItem('currentGuildId', String(guildId));
      localStorage.setItem('currentGuildRole', guild.role);
      set({ currentGuildId: guildId, currentGuildRole: guild.role });
    }
  },

  clearGuild: () => {
    localStorage.removeItem('currentGuildId');
    localStorage.removeItem('currentGuildRole');
    set({ currentGuildId: null, currentGuildRole: null, guilds: [] });
  },
}));
