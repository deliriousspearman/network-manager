import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fetchSubnet, createSubnet, updateSubnet } from '../../api/subnets';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { onCmdEnterSubmit } from '../../hooks/useCmdEnterSubmit';
import { Skeleton } from '../ui/Skeleton';
import { subnetFormSchema, type SubnetFormValues } from '../../schemas/subnet';

export default function SubnetForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SubnetFormValues>({
    resolver: zodResolver(subnetFormSchema),
    defaultValues: { name: '', cidr: '', vlan_id: '', description: '' },
  });

  useUnsavedChanges(isDirty);

  const { data: subnet, isLoading: subnetLoading } = useQuery({
    queryKey: queryKeys.subnets.detail(projectId, Number(id)),
    queryFn: () => fetchSubnet(projectId, Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (subnet) {
      reset({
        name: subnet.name,
        cidr: subnet.cidr,
        vlan_id: subnet.vlan_id?.toString() || '',
        description: subnet.description || '',
      });
    }
  }, [subnet, reset]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? updateSubnet(projectId, Number(id), data) : createSubnet(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subnets.all(projectId) });
      navigate(`${base}/subnets`);
    },
  });

  const onSubmit = (values: SubnetFormValues) => {
    mutation.mutate({
      name: values.name,
      cidr: values.cidr,
      vlan_id: values.vlan_id ? Number(values.vlan_id) : undefined,
      description: values.description || undefined,
      updated_at: isEdit ? subnet?.updated_at : undefined,
    });
  };

  if (isEdit && subnetLoading) {
    return (
      <div>
        <div className="page-header">
          <h2>Edit Subnet</h2>
        </div>
        <div className="card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="form-group">
              <label><Skeleton width={80} height={12} /></label>
              <Skeleton width="100%" height={36} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Subnet' : 'New Subnet'}</h2>
      </div>

      <form className="card" onSubmit={handleSubmit(onSubmit)} onKeyDown={onCmdEnterSubmit}>
        <div className="form-group">
          <label>Name *</label>
          <input {...register('name')} placeholder="Management Network" aria-invalid={!!errors.name} />
          {errors.name && <div className="form-error">{errors.name.message}</div>}
        </div>
        <div className="form-group">
          <label>CIDR *</label>
          <input {...register('cidr')} placeholder="192.168.1.0/24" aria-invalid={!!errors.cidr} />
          {errors.cidr && <div className="form-error">{errors.cidr.message}</div>}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>VLAN ID</label>
            <input type="number" {...register('vlan_id')} placeholder="100" aria-invalid={!!errors.vlan_id} />
            {errors.vlan_id && <div className="form-error">{errors.vlan_id.message}</div>}
          </div>
          <div className="form-group">
            <label>Description</label>
            <input {...register('description')} />
          </div>
        </div>
        {mutation.isError && (
          <div className="form-error">
            {(mutation.error as Error)?.message}
          </div>
        )}
        <div className="actions actions-spaced">
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Subnet')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`${base}/subnets`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
