import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../features/catalog/domain/catalog_models.dart';
import 'offline_database.dart';
import 'offline_models.dart';
import 'offline_sale_models.dart';

class OfflineSaleController extends ChangeNotifier {
  OfflineSaleController(this._database);

  final OfflineDatabase _database;

  String? _locationId;
  String? _currency;
  OfflineSaleDraft? _draft;
  bool _busy = false;
  bool _loaded = false;
  String? _errorMessage;
  String? _noticeMessage;

  String? get locationId => _locationId;
  OfflineSaleDraft? get draft => _draft;
  bool get busy => _busy;
  bool get loaded => _loaded;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;
  List<OfflineSaleLine> get items => _draft?.items ?? const [];
  int get totalCents => _draft?.totalCents ?? 0;

  Future<void> bindLocation({
    required String locationId,
    required String currency,
  }) async {
    final normalizedCurrency = currency.trim().toUpperCase();
    if (_locationId == locationId &&
        _currency == normalizedCurrency &&
        _loaded) {
      return;
    }
    _locationId = locationId;
    _currency = normalizedCurrency;
    _draft = null;
    _loaded = false;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();

    try {
      final raw = await _database.readCache(_draftKey(locationId));
      if (raw != null) {
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          final restored = OfflineSaleDraft.fromJson(
            Map<String, Object?>.from(decoded),
          );
          if (restored.locationId == locationId &&
              restored.currency == normalizedCurrency) {
            _draft = restored;
          }
        }
      }
    } catch (_) {
      _errorMessage = 'La vendita offline salvata non è leggibile.';
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }

  Future<bool> addProduct({
    required CatalogSnapshot snapshot,
    required CatalogProduct product,
    CatalogVariant? variant,
    required int quantityAmount,
    String? note,
  }) async {
    if (!_readyFor(snapshot) || _busy) {
      return false;
    }
    _setBusy();
    try {
      final current =
          _draft ??
          OfflineSaleDraft.empty(
            locationId: snapshot.locationId,
            currency: snapshot.currency,
          );
      final candidate = OfflineSaleLine.fromCatalog(
        snapshot: snapshot,
        product: product,
        variant: variant,
        quantityAmount: quantityAmount,
        note: note,
      );
      final next = List<OfflineSaleLine>.from(current.items);
      final existingIndex = next.indexWhere(
        (line) =>
            line.productId == candidate.productId &&
            line.variantId == candidate.variantId &&
            line.note == candidate.note &&
            line.quantityScale == candidate.quantityScale &&
            line.unitPriceCents == candidate.unitPriceCents &&
            line.vatRateIdSnapshot == candidate.vatRateIdSnapshot,
      );
      if (existingIndex >= 0) {
        final existing = next[existingIndex];
        next[existingIndex] = existing.copyWith(
          quantityAmount: existing.quantityAmount + quantityAmount,
        );
      } else {
        next.add(candidate);
      }
      _draft = current.copyWith(items: next);
      await _persistDraft();
      _errorMessage = null;
      _noticeMessage = '${candidate.displayName} aggiunto offline.';
      return true;
    } catch (error) {
      _errorMessage = error is StateError
          ? error.message.toString()
          : 'Impossibile salvare il prodotto offline.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> updateQuantity(OfflineSaleLine line, int quantityAmount) async {
    final current = _draft;
    if (current == null || _busy || quantityAmount <= 0) {
      return false;
    }
    _setBusy();
    try {
      final next = current.items
          .map(
            (item) => item.clientItemId == line.clientItemId
                ? item.copyWith(quantityAmount: quantityAmount)
                : item,
          )
          .toList(growable: false);
      _draft = current.copyWith(items: next);
      await _persistDraft();
      return true;
    } catch (_) {
      _errorMessage = 'Impossibile aggiornare la quantità offline.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> removeLine(OfflineSaleLine line) async {
    final current = _draft;
    if (current == null || _busy) {
      return false;
    }
    _setBusy();
    try {
      final next = current.items
          .where((item) => item.clientItemId != line.clientItemId)
          .toList(growable: false);
      _draft = next.isEmpty ? null : current.copyWith(items: next);
      if (_draft == null) {
        await _database.deleteCache(_draftKey(current.locationId));
      } else {
        await _persistDraft();
      }
      return true;
    } catch (_) {
      _errorMessage = 'Impossibile rimuovere la riga offline.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<void> discardDraft() async {
    final locationId = _locationId;
    if (locationId == null || _busy) {
      return;
    }
    _setBusy();
    try {
      await _database.deleteCache(_draftKey(locationId));
      _draft = null;
      _errorMessage = null;
      _noticeMessage = null;
    } finally {
      _finishBusy();
    }
  }

  Future<OfflineCashSaleResult?> completeCashSale(int tenderedCents) async {
    final current = _draft;
    if (current == null || current.items.isEmpty || _busy) {
      return null;
    }
    if (tenderedCents < current.totalCents) {
      _errorMessage = 'Il contante ricevuto è inferiore al totale.';
      notifyListeners();
      return null;
    }

    _setBusy();
    try {
      final payload = jsonEncode(
        current.toReplayJson(tenderedCents: tenderedCents),
      );
      await _database.enqueue(
        id: current.saleId,
        kind: OfflineOperationKind.completeCashSale,
        payloadJson: payload,
      );
      await _database.deleteCache(_draftKey(current.locationId));
      final result = OfflineCashSaleResult(
        saleId: current.saleId,
        totalCents: current.totalCents,
        tenderedCents: tenderedCents,
      );
      _draft = null;
      _errorMessage = null;
      _noticeMessage =
          'Vendita salvata sul dispositivo. Verrà sincronizzata automaticamente.';
      return result;
    } catch (_) {
      _errorMessage =
          'Impossibile mettere in coda la vendita. Non ripetere l’incasso finché non verifichi lo stato.';
      return null;
    } finally {
      _finishBusy();
    }
  }

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  bool _readyFor(CatalogSnapshot snapshot) {
    if (!_loaded || _locationId == null || _currency == null) {
      _errorMessage = 'Cassa offline non ancora pronta.';
      notifyListeners();
      return false;
    }
    if (snapshot.locationId != _locationId ||
        snapshot.currency.toUpperCase() != _currency) {
      _errorMessage = 'Catalogo offline non coerente con la sede corrente.';
      notifyListeners();
      return false;
    }
    return true;
  }

  Future<void> _persistDraft() async {
    final current = _draft;
    if (current == null) {
      return;
    }
    await _database.putCache(
      _draftKey(current.locationId),
      jsonEncode(current.toJson()),
    );
  }

  void _setBusy() {
    _busy = true;
    _errorMessage = null;
    notifyListeners();
  }

  void _finishBusy() {
    _busy = false;
    notifyListeners();
  }

  static String _draftKey(String locationId) =>
      'offline-sale-draft:$locationId';
}
