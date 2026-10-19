package jp.kusakari.ec.catalog.service;

import java.io.IOException;
import java.util.Arrays;
import java.util.UUID;
import jp.kusakari.ec.catalog.persistence.entity.ProductMediaEntity;
import jp.kusakari.ec.catalog.persistence.repository.ProductMediaRepository;
import jp.kusakari.ec.common.web.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class ProductMediaService {

  private final ProductMediaRepository media;

  public record Image(String contentType, byte[] bytes) {}

  @Transactional
  public String upload(MultipartFile file) {
    if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) throw invalid();
    try {
      byte[] bytes = file.getBytes();
      String type = detect(bytes);
      if (!type.equals(file.getContentType())) throw invalid();
      ProductMediaEntity row = new ProductMediaEntity();
      row.setId(UUID.randomUUID().toString());
      row.setContentType(type);
      row.setImageData(bytes);
      media.save(row);
      return "/api/product-images/" + row.getId();
    } catch (IOException error) {
      throw invalid();
    }
  }

  @Transactional(readOnly = true)
  public Image get(String id) {
    var row = media.findById(id).orElseThrow(() -> new ApiException(404, "IMAGE_NOT_FOUND", "画像が見つかりません。"));
    return new Image(row.getContentType(), row.getImageData());
  }

  private String detect(byte[] b) {
    if (b.length < 12) throw invalid();
    if (Arrays.equals(Arrays.copyOf(b, 8), new byte[] { (byte) 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
    if (b[0] == (byte) 255 && b[1] == (byte) 216 && b[2] == (byte) 255) return "image/jpeg";
    if (
      new String(b, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") &&
      new String(b, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")
    ) return "image/webp";
    throw invalid();
  }

  private ApiException invalid() {
    return new ApiException(400, "INVALID_IMAGE", "画像は5MB以下のPNG・JPEG・WebPで選択してください。");
  }
}
