package jp.kusakari.ec.shopping;

import java.util.List;
import jp.kusakari.ec.catalog.service.CatalogService;
import jp.kusakari.ec.commerce.persistence.repository.CartRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** EC selections supplement the owner's Canvas projection without changing placements. */
@Repository
@RequiredArgsConstructor
public class SavedShoppingItems {

  private final JdbcTemplate jdbc;
  private final CartRepository carts;
  private final CatalogService catalog;

  public record SavedProduct(String id, String name) {}

  public record Snapshot(long revision, List<SavedProduct> products) {}

  @Transactional(readOnly = true)
  public Snapshot read(String cartId, String gardenId) {
    var revisions = jdbc.queryForList(
      "SELECT revision FROM garden_shopping_lists WHERE cart_id=? AND garden_id=?",
      Long.class,
      cartId,
      gardenId
    );
    var products = jdbc.query(
      "SELECT p.id,p.name FROM garden_shopping_items i JOIN products p ON p.id=i.product_id " +
        "WHERE i.cart_id=? AND i.garden_id=? ORDER BY p.id",
      (row, index) -> new SavedProduct(row.getString("id"), row.getString("name")),
      cartId,
      gardenId
    );
    return new Snapshot(revisions.isEmpty() ? 0 : revisions.getFirst(), products);
  }

  @Transactional(readOnly = true)
  public List<String> gardens(String cartId) {
    return jdbc.queryForList(
      "SELECT garden_id FROM garden_shopping_lists WHERE cart_id=? AND revision>0",
      String.class,
      cartId
    );
  }

  // The caller holds this lock until the cart transfer transaction finishes.
  public Snapshot lockAndRead(String cartId, String gardenId) {
    lock(cartId);
    return read(cartId, gardenId);
  }

  @Transactional
  public void add(String cartId, String gardenId, String productId) {
    var cart = lock(cartId);
    var product = catalog.product(productId, cart.getStoreId());
    if (!product.active()) throw new ApiException(409, "PRODUCT_ARCHIVED", "この商品は販売を終了しています。");
    var existing = read(cartId, gardenId);
    if (
      existing
        .products()
        .stream()
        .anyMatch(p -> p.id().equals(productId))
    ) return;
    if (existing.products().size() >= 200) throw new ApiException(
      400,
      "SHOPPING_LIST_LIMIT",
      "追加できる商品は庭ごとに200種類までです。"
    );
    if (existing.revision() == 0) jdbc.update(
      "INSERT INTO garden_shopping_lists(cart_id,garden_id,revision) VALUES(?,?,0)",
      cartId,
      gardenId
    );
    jdbc.update(
      "INSERT INTO garden_shopping_items(cart_id,garden_id,product_id) VALUES(?,?,?)",
      cartId,
      gardenId,
      productId
    );
    jdbc.update(
      "UPDATE garden_shopping_lists SET revision=revision+1 WHERE cart_id=? AND garden_id=?",
      cartId,
      gardenId
    );
  }

  private jp.kusakari.ec.commerce.persistence.entity.CartEntity lock(String cartId) {
    return carts
      .findLocked(cartId)
      .orElseThrow(() -> new ApiException(404, "CART_NOT_FOUND", "カートが見つかりません。"));
  }
}
