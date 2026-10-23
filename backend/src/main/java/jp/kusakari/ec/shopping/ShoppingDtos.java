package jp.kusakari.ec.shopping;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import jp.kusakari.ec.commerce.dto.CommerceDtos.CartView;

public final class ShoppingDtos {

  private ShoppingDtos() {}

  public record Summary(
    String gardenId,
    String name,
    long revision,
    String updatedAt,
    int productCount,
    int itemCount,
    String thumbnailVersion
  ) {}

  public record SourceRow(String key, String name, String productId, String materialCode, int quantity, String unit) {}

  public record SourceList(String gardenId, String name, long revision, String updatedAt, List<SourceRow> items) {}

  public record CreatedGarden(String id, String name) {}

  public record Product(String id, String name, String imageUrl, int priceYen, int stock, boolean active) {}

  public record Line(String key, String name, int quantity, String unit, List<Product> products) {}

  public record Detail(
    String gardenId,
    String name,
    long revision,
    String updatedAt,
    long storeId,
    String storeName,
    List<Line> items,
    long listRevision
  ) {}

  public record Selection(@NotBlank @Size(max = 100) String key, @NotBlank @Size(max = 40) String productId) {}

  public record TransferRequest(
    @NotNull @PositiveOrZero Long gardenRevision,
    @NotNull @PositiveOrZero Long cartRevision,
    @NotEmpty @Size(max = 200) List<@NotNull @Valid Selection> items,
    @PositiveOrZero Long listRevision
  ) {}

  public record Addition(String productId, String name, int quantity) {}

  public record Outcome(String productId, String name, int quantity, String code, String message) {}

  public record TransferResult(
    CartView cart,
    String gardenId,
    String gardenName,
    List<Outcome> added,
    List<Outcome> skipped
  ) {}
}
