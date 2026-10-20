package jp.kusakari.ec.common.web;

import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiErrors {

  public record ErrorView(String code, String message) {}

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ErrorView> business(ApiException error) {
    return ResponseEntity.status(error.status()).body(new ErrorView(error.code(), error.getMessage()));
  }

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
  })
  public ResponseEntity<ErrorView> invalid(Exception error) {
    return ResponseEntity.badRequest().body(
      new ErrorView("INVALID_INPUT", "入力内容・文字数・数値の範囲を確認してください。")
    );
  }

  @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
  public ResponseEntity<ErrorView> imageTooLarge(Exception error) {
    return ResponseEntity.status(413).body(new ErrorView("IMAGE_TOO_LARGE", "画像は1枚5MB以下にしてください。"));
  }

  @ExceptionHandler({
    org.springframework.dao.OptimisticLockingFailureException.class,
    org.springframework.dao.DataIntegrityViolationException.class,
  })
  public ResponseEntity<ErrorView> conflict(Exception error) {
    return ResponseEntity.status(409).body(
      new ErrorView("DATA_CHANGED", "データが競合しました。最新の内容を確認してください。")
    );
  }

  @ExceptionHandler(DataAccessException.class)
  public ResponseEntity<ErrorView> database(DataAccessException error) {
    return ResponseEntity.status(503).body(
      new ErrorView("DATABASE_UNAVAILABLE", "保存処理を完了できませんでした。時間をおいて再試行してください。")
    );
  }
}
