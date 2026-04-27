import { z } from 'zod';
import { isValidCidr } from '../utils/validation';

export const subnetFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  cidr: z.string().trim()
    .min(1, 'CIDR is required')
    .refine(isValidCidr, 'Invalid CIDR notation. Expected format: 192.168.1.0/24'),
  vlan_id: z.string().trim()
    .refine(v => v === '' || /^\d+$/.test(v), 'VLAN ID must be a number')
    .refine(v => {
      if (v === '') return true;
      const n = Number(v);
      return n >= 1 && n <= 4094;
    }, 'VLAN ID must be between 1 and 4094'),
  description: z.string().trim().max(1000),
});

export type SubnetFormValues = z.infer<typeof subnetFormSchema>;
