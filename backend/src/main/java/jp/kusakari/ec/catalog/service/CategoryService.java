package jp.kusakari.ec.catalog.service;

import java.time.Instant;
import java.util.*;
import jp.kusakari.ec.auth.AuthService;
import jp.kusakari.ec.catalog.persistence.entity.CategoryEntity;
import jp.kusakari.ec.catalog.persistence.repository.*;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class CategoryService {

  private final CategoryRepository categories;
  private final ProductRepository products;
  private final AuthService auth;

  @Transactional(readOnly = true)
  public List<String> list() {
    return categories.findByDeletedAtIsNull().stream().map(CategoryEntity::getName).sorted().toList();
  }

  public void save(String previous, String input) {
    auth.requireAdmin();
    String name = input.trim();
    if (name.isEmpty()) throw new ApiException(400, "INVALID_CATEGORY", "カテゴリ名を入力してください。");
    if (name.equals(previous)) return;
    var existing = categories.lock(name);
    if (existing.filter(CategoryEntity::isAvailable).isPresent()) throw new ApiException(
      409,
      "CATEGORY_EXISTS",
      "同じカテゴリがあります。"
    );
    if (!previous.isEmpty() && categories.lock(previous).filter(CategoryEntity::isAvailable).isEmpty()) {
      throw notFound();
    }
    // A name deleted earlier is still referenced by deleted products; adding it again restores the row.
    var target = existing.orElseGet(() -> new CategoryEntity(name));
    target.setDeletedAt(null);
    categories.saveAndFlush(target);
    if (!previous.isEmpty()) {
      products.renameCategory(previous, name);
      categories.deleteById(previous);
    }
  }

  public void delete(String name) {
    auth.requireAdmin();
    var category = categories.lock(name).filter(CategoryEntity::isAvailable).orElseThrow(this::notFound);
    // EC-A09 2a: only products that are still listed in at least one store keep a category in use.
    if (products.isCategoryInUse(name)) throw new ApiException(
      409,
      "CATEGORY_IN_USE",
      "商品で使用中のカテゴリは削除できません。先に該当商品を別のカテゴリへ移してください。"
    );
    // Deleted products keep their category for order and garden records, so the row stays (fk_product_category).
    if (products.existsByCategory(name)) category.setDeletedAt(Instant.now());
    else categories.delete(category);
  }

  public void require(String name) {
    if (categories.share(name).filter(CategoryEntity::isAvailable).isEmpty()) throw new ApiException(
      400,
      "INVALID_CATEGORY",
      "登録済みのカテゴリを選択してください。"
    );
  }

  private ApiException notFound() {
    return new ApiException(404, "CATEGORY_NOT_FOUND", "カテゴリが見つかりません。");
  }
}
