import { EventCatalogService, EventStatusAction } from '../EventCatalogService';
import { Event } from '@/core/betting/domain/entities/Event';
import { EventStatus } from '@/core/betting/types/bet.types';

function eventFixture(over: {
  id?: string;
  name?: string;
  status?: EventStatus;
  category?: string;
  participants?: string[];
} = {}) {
  return new Event(
    over.id ?? 'ev-1',
    over.name ?? 'Flamengo x Palmeiras',
    new Date('2026-10-01T19:00:00Z'),
    over.status ?? 'SCHEDULED',
    over.category ?? 'futebol',
    over.participants ?? ['Flamengo', 'Palmeiras'],
    new Map(),
  );
}

function harness() {
  const repository = {
    findAll: jest.fn(),
    findUpcoming: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };
  return { repository, service: new EventCatalogService(repository as any) };
}

describe('EventCatalogService', () => {
  it('listEvents repassa os filtros ao repositório e devolve tudo sem busca/limite', async () => {
    const { repository, service } = harness();
    const events = [eventFixture(), eventFixture({ id: 'ev-2', name: 'Vasco x Botafogo' })];
    repository.findAll.mockResolvedValue(events);

    const filter = { status: 'SCHEDULED' as EventStatus, category: 'futebol', dateFrom: new Date() };
    const result = await service.listEvents(filter);

    expect(repository.findAll).toHaveBeenCalledWith({
      status: 'SCHEDULED',
      category: 'futebol',
      dateFrom: filter.dateFrom,
      dateTo: undefined,
    });
    expect(result).toHaveLength(2);
  });

  it('listEvents filtra por busca no nome (case-insensitive, sem espaços)', async () => {
    const { repository, service } = harness();
    repository.findAll.mockResolvedValue([
      eventFixture({ id: 'ev-1', name: 'Flamengo x Palmeiras', participants: ['Flamengo', 'Palmeiras'] }),
      eventFixture({ id: 'ev-2', name: 'Vasco x Botafogo', participants: ['Vasco', 'Botafogo'] }),
    ]);

    const result = await service.listEvents({ search: '  flAmeNgO  ' });
    expect(result.map((e) => e.id)).toEqual(['ev-1']);
  });

  it('listEvents filtra por participante', async () => {
    const { repository, service } = harness();
    repository.findAll.mockResolvedValue([
      eventFixture({ id: 'ev-1', name: 'Clássico', participants: ['Flamengo', 'Vasco'] }),
      eventFixture({ id: 'ev-2', name: 'Outro', participants: ['Palmeiras', 'Corinthians'] }),
    ]);

    const result = await service.listEvents({ search: 'vaSco' });
    expect(result.map((e) => e.id)).toEqual(['ev-1']);
  });

  it('listEvents com busca só de espaços não filtra', async () => {
    const { repository, service } = harness();
    repository.findAll.mockResolvedValue([eventFixture(), eventFixture({ id: 'ev-2' })]);

    const result = await service.listEvents({ search: '   ' });
    expect(result).toHaveLength(2);
  });

  it('listEvents aplica o limit', async () => {
    const { repository, service } = harness();
    repository.findAll.mockResolvedValue([eventFixture(), eventFixture({ id: 'ev-2' }), eventFixture({ id: 'ev-3' })]);

    const result = await service.listEvents({ limit: 2 });
    expect(result.map((e) => e.id)).toEqual(['ev-1', 'ev-2']);
  });

  it('listUpcoming usa default 10 e aceita limite próprio', async () => {
    const { repository, service } = harness();
    repository.findUpcoming.mockResolvedValue([eventFixture()]);

    await service.listUpcoming();
    expect(repository.findUpcoming).toHaveBeenCalledWith(10);

    await service.listUpcoming(5);
    expect(repository.findUpcoming).toHaveBeenCalledWith(5);
  });

  it('getEvent devolve o evento ou lança EVENT_NOT_FOUND', async () => {
    const { repository, service } = harness();
    const event = eventFixture();
    repository.findById.mockResolvedValue(event);

    await expect(service.getEvent('ev-1')).resolves.toBe(event);

    repository.findById.mockResolvedValue(null);
    await expect(service.getEvent('ev-x')).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });

  it('listCategories deduplica e ordena alfabeticamente', async () => {
    const { repository, service } = harness();
    repository.findAll.mockResolvedValue([
      eventFixture({ category: 'b' }),
      eventFixture({ id: 'ev-2', category: 'a' }),
      eventFixture({ id: 'ev-3', category: 'b' }),
    ]);

    const categories = await service.listCategories();
    expect(categories).toEqual(['a', 'b']);
  });

  it('updateEventStatus START: TRANSITA evento agendado para vivo', async () => {
    const { repository, service } = harness();
    const event = eventFixture({ status: 'SCHEDULED' });
    repository.findById.mockResolvedValue(event);

    const result = await service.updateEventStatus('ev-1', 'START' as EventStatusAction);
    expect(result.status).toBe('LIVE');
    expect(repository.update).toHaveBeenCalledWith(event);
  });

  it('updateEventStatus FINISH transita evento vivo para finalizado', async () => {
    const { repository, service } = harness();
    const event = eventFixture({ status: 'SCHEDULED' });
    event.start();
    repository.findById.mockResolvedValue(event);

    const result = await service.updateEventStatus('ev-1', 'FINISH' as EventStatusAction);
    expect(result.status).toBe('FINISHED');
    expect(repository.update).toHaveBeenCalledWith(event);
  });

  it('updateEventStatus CANCEL cancela evento agendado', async () => {
    const { repository, service } = harness();
    const event = eventFixture({ status: 'SCHEDULED' });
    repository.findById.mockResolvedValue(event);

    const result = await service.updateEventStatus('ev-1', 'CANCEL' as EventStatusAction);
    expect(result.status).toBe('CANCELED');
    expect(repository.update).toHaveBeenCalledWith(event);
  });

  it('updateEventStatus com ação inválida lança EVENT_INVALID_ACTION sem tocar no repositório', async () => {
    const { repository, service } = harness();
    repository.findById.mockResolvedValue(eventFixture());

    await expect(service.updateEventStatus('ev-1', 'PAUSE' as EventStatusAction)).rejects.toMatchObject({
      code: 'EVENT_INVALID_ACTION',
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('updateEventStatus com evento inexistente propaga EVENT_NOT_FOUND', async () => {
    const { repository, service } = harness();
    repository.findById.mockResolvedValue(null);

    await expect(service.updateEventStatus('ev-x', 'START' as EventStatusAction)).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
  });
});