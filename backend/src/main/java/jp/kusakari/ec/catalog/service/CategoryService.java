package jp.kusakari.ec.catalog.service;

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
    return categories.findAll().stream().map(CategoryEntity::getName).sorted().toList();
  }

  public void save(String previous, String name) {
    auth.requireAdmin();
    name = name.trim();
    if (name.isEmpty()) throw new ApiException(400, "INVALID_CATEGORY", "カテゴリ名を入力してください。");
    if (name.equals(previous)) return;
    if (categories.existsById(name)) throw new ApiException(409, "CATEGORY_EXISTS", "同じカテゴリがあります。");
    if (!previous.isEmpty() && !categories.existsById(previous)) throw new ApiException(
      404,
      "CATEGORY_NOT_FOUND",
      "カテゴリが見つかりません。"
    );
    categories.saveAndFlush(new CategoryEntity(name));
    if (!previous.isEmpty()) {
      products.renameCategory(previous, name);
      categories.deleteById(previous);
    }
  }

  public void delete(String name) {
    auth.requireAdmin();
    if (products.existsByCategory(name)) throw new ApiException(
      409,
      "CATEGORY_IN_USE",
      "商品で使用中のカテゴリは削除できません。"
    );
    categories.deleteById(name);
  }

  public void require(String name) {
    if (!categories.existsById(name)) throw new ApiException(
      400,
      "INVALID_CATEGORY",
      "登録済みのカテゴリを選択してください。"
    );
  }
}
